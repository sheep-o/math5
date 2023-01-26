const express = require("express");
const app = express();
const server = require("http").Server(app);
const { Server } = require("socket.io");
const io = new Server(server);
const mjAPI = require("mathjax-node");
const fs = require("fs/promises");
const { exec } = require("child_process");

server.listen(3000, (_) => {
  console.log("listening...");
});

io.on("connection", (socket) => {
  console.log("new connection");

  let options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: "",
  };
  socket.on("locate", async (img) => {
    fs.mkdir("in").catch(() => 1);
    let fileName = `in/in${String(Math.random()).replace("0.", "")}.png`;
    let output = `out/${String(Math.random()).replace("0.", "")}/`;
    await fs
      .writeFile(fileName, img.replace("data:image/png;base64,", ""), {
        encoding: "base64",
      })
      .catch((e) => console.log(e));
    exec(`./readtext.py ${fileName} ${output}`, async function (a, b, c) {
      let files = [];
      try {
        files = await fs.readdir(output);
      } catch (e) {
        console.log("Error locating text in picture");
      }
      let data = [];
      for (const file in files) {
        data.push(
          await fs.readFile(output + files[file], { encoding: "base64" })
        );
      }
      socket.send({
        type: "locate",
        content: data.map((e) => "data:image/png;base64," + e),
      });
    });
  });
  socket.on("read", async ({ img, id }) => {
    options.body = `{"data": "${img.replace(
      "data:image/png;base64,",
      ""
    )}", "inputForm": "Image"}`;

    const latex = await fetch(
      "https://www.bing.com/cameraexp/api/v1/getlatex",
      options
    )
      .then((res) => res.json())
      .then((res) => res.latex)
      .catch((err) => console.error(err));

    mjAPI.typeset(
      {
        math: String.raw`${latex}`,
        format: "TeX", // or "inline-TeX", "MathML"
        mml: true, // or svg:true, or html:true
      },
      (data) => {
        if (!data.errors) {
          socket.send({
            type: "latex",
            content: { latex: latex, html: data.mml, id },
          });
        } else socket.send({ type: "latex", content: "error" });
      }
    );
  });

  socket.on("solve", async ({ latex, id }) => {
    options.body = JSON.stringify({ latexExpression: latex });

    const data = await fetch(
      "https://www.bing.com/cameraexp/api/v1/solvelatex",
      options
    )
      .then((res) => res.json())
      .then((res) => res.results[0].tags[0].actions[0].customData)
      .catch((err) => console.error(err));
    let msg = {
      type: "solution",
      content: {
        solution: [],
        id,
      },
    };

    if (JSON.parse(JSON.parse(data).previewText).mathSolverResult != null) {
      const mathSolverResult = JSON.parse(
        JSON.parse(data).previewText
      ).mathSolverResult;
      const actions = mathSolverResult.actions;
      socket.send({
        type: "graph",
        content: { graph: mathSolverResult.allGraphData, id },
      });
      let errors = false;
      await Promise.all(
        actions.map(async (action) => {
          action.templateSteps = await Promise.all(
            action.templateSteps.map(async (e) => {
              return {
                templateName: e.templateName,
                steps: await Promise.all(
                  e.steps.map(async (e) => {
                    const data = await mjAPI.typeset({
                      math: String.raw`${e.expression.replaceAll("$", "")}`,
                      format: "TeX", // or "inline-TeX", "MathML"
                      mml: true, // or svg:true, or html:true
                    });
                    async function replaceAsync(str, regex, asyncFn) {
                      const promises = [];
                      str.replaceAll(regex, (match, ...args) => {
                        const promise = asyncFn(match, ...args);
                        promises.push(promise);
                        return match;
                      });
                      const result = await Promise.all(promises);
                      return str.replace(regex, () => result.shift());
                    }
                    e.step = await replaceAsync(
                      e.step,
                      /\$(.*?)\$/g,
                      async (e) => {
                        const answer = await mjAPI.typeset({
                          math: String.raw`${e.replaceAll("$", "")}`,
                          format: "inline-TeX", // or "inline-TeX", "MathML"
                          mml: true, // or svg:true, or html:true
                        });
                        let mml = "";
                        if (answer.errors) {
                          errors = true;
                        } else {
                          mml = answer.mml;
                        }
                        return mml;
                      }
                    );
                    let mml = "";
                    if (data.errors) {
                      errors = true;
                    } else {
                      mml = data.mml;
                    }
                    return {
                      step: e.step,
                      expression: mml,
                    };
                  })
                ),
              };
            })
          );
          const data = await mjAPI.typeset({
            math: String.raw`${action.solution.replaceAll("$", "")}`,
            format: "TeX", // or "inline-TeX", "MathML"
            mml: true, // or svg:true, or html:true
          });
          if (data.errors) errors = true;
          if (!errors) {
            msg.content.solution.push({ action: action, html: data.mml });
          } else {
            socket.send({ type: "solution", content: "error" });
          }
        })
      );

      socket.send(msg);
    }
  });
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});
