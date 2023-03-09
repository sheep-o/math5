const express = require("express");
const app = express();
const server = require("http").Server(app);
const { Server } = require("socket.io");
const io = new Server(server);
const mjAPI = require("mathjax-node");
const fs = require("fs/promises");
const { exec } = require("child_process");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const sharp = require("sharp");
const dotenv = require("dotenv");
const puppeteer = require("puppeteer");
dotenv.config({ path: ".env" });
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
    exec("mkdir out");
    await fs
      .writeFile(fileName, img.replace("data:image/png;base64,", ""), {
        encoding: "base64",
      })
      .catch((e) => e);
    exec(`./readtext.py ${fileName} ${output}`, async function () {
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
    const [[latex, data], text] = await Promise.all([
      new Promise(async (res) => {
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
              res([latex, data.mml]);
            } else res("", "");
          }
        );
      }),
      new Promise(async (res) => {
        const fileName = Math.random().toString(36).substring(7);
        await fs
          .writeFile(
            `in/in${fileName}.png`,
            img.replace("data:image/png;base64,", ""),
            {
              encoding: "base64",
            }
          )
          .catch((e) => e);
        exec(
          `./handwriting/main.py --img_file in/in${fileName}.png`,
          (err, stdout) => {
            if (!err) {
              let text = stdout.split(
                "Recognized6759347634567835768345678534267854:"
              );
              text = text[text.length - 1];
              text = text.trim();
              if (text.search(/[a-zA-Z]/) === -1) {
                res("");
              } else {
                res(text);
              }
            } else {
              console.log(err);
              res("");
            }
          }
        );
      }),
    ]);
    socket.send({ type: "text", content: { latex, data, text, id } });
  });
  socket.on("answer", async ({ question, id }) => {
    console.log("Asking bing for answer to " + question);
    if (!process.env.MICROSOFT) {
      socket.send({
        type: "answer",
        content: {
          question,
          result: ["Please set the MICROSOFT environment variable"],
          id,
        },
      });
      console.log("Set the MICROSOFT environment variable");
      return;
    }
    const connect = await open({
      filename: "db.db",
      driver: sqlite3.Database,
    });
    await connect.run(
      "CREATE TABLE IF NOT EXISTS answers (id TEXT PRIMARY KEY, answer TEXT)"
    );
    const answers = await connect.all("SELECT * FROM answers WHERE id=?", [
      String(question),
    ]);
    if (answers.length > 0) {
      console.log("Using cached answer to " + question);
      const answer = JSON.parse(answers[0].answer);
      socket.send({
        type: "answer",
        content: { result: answer, id, question },
      });
      connect.close();
      return;
    }
    const browser = await puppeteer.launch({
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      args: ["--no-sandbox"],
    });

    // 2. Open a new page
    const page = await browser.newPage().catch(() => "1");
    if (page === "1") {
      socket.send({
        type: "answer",
        content: {
          question,
          result: ["Failed to reach Bing"],
          id,
        },
      });
      console.error("Failed to reach Bing");
      connect.close();
      browser.close();
      return;
    }
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36 Edg/110.0.100.0"
    );
    await page.goto("https://bing.com");
    let reuslt = await page
      .evaluate(
        `document.cookie = "_U=${process.env.MICROSOFT}";document.cookie = "SRCHHPGUSR=CHTRSP=2"`
      )
      .catch(() => "1");
    if (reuslt === "1") {
      socket.send({
        type: "answer",
        content: {
          question,
          result: ["Failed to reach Bing"],
          id,
        },
      });
      console.error("Failed to reach Bing 1");
      connect.close();
      browser.close();
      return;
    }
    await new Promise((res) => setTimeout(res, 4000));
    await page.goto(
      `https://www.bing.com/search?q=${encodeURIComponent(question)}`
    );
    await new Promise((res) => setTimeout(res, 1000));
    const input = await page
      .waitForFunction(`document.querySelectorAll(".cib-serp-main")[1]`)
      .catch(() => "1");
    if (input === "1") {
      socket.send({
        type: "answer",
        content: {
          question,
          result: ["This question is not supported/understood"],
          id,
        },
      });
      connect.close();
      browser.close();
      console.error("No valid answer for this question");
      return;
    }
    const lol = await page
      .waitForFunction(
        () =>
          document
            .querySelectorAll(".cib-serp-main")[1]
            .shadowRoot.querySelector("cib-typing-indicator")
            .shadowRoot.querySelector("#stop-responding-button").disabled
      )
      .catch(() => "1");
    if (lol === "1") {
      socket.send({
        type: "answer",
        content: {
          question,
          result: ["Failed to reach Bing"],
          id,
        },
      });
      connect.close();
      browser.close();
      console.error("Failed to reach Bing 3");
      return;
    }
    await new Promise((res) => setTimeout(res, 500));
    const result = await page
      .evaluate(() => {
        const elements = document
          .querySelectorAll(".cib-serp-main")[1]
          .shadowRoot.querySelector("#cib-conversation-main")
          .shadowRoot.querySelector("cib-message-group")
          .shadowRoot.querySelector(".cib-message-main")
          .shadowRoot.querySelector(".ac-textBlock").children;
        return Object.values(elements).map((e) =>
          Object.values(e.childNodes)
            .filter((e) => (e.classList ?? [0])[0] != "ac-anchor")
            .map((e) => e.textContent)
            .join("")
        );
      })
      .catch(() => ["Failed to reach Bing"]);
    socket.send({ type: "answer", content: { result, question, id } });
    if (result[0] !== "Failed to reach Bing") {
      connect.run("INSERT OR IGNORE INTO answers VALUES (?, ?)", [
        String(question),
        JSON.stringify(result),
      ]);
    }
    connect.close();
    await browser.close();
  });
  socket.on("solve", async ({ latex, id }) => {
    const connect = await open({
      filename: "db.db",
      driver: sqlite3.Database,
    });
    await connect.run(
      "CREATE TABLE IF NOT EXISTS solutions (id TEXT PRIMARY KEY, solution TEXT)"
    );
    const solution = await connect.all("SELECT * FROM solutions WHERE id = ?", [
      String(latex),
    ]);
    if (solution.length > 0) {
      const answer = JSON.parse(solution[0].solution);
      answer.forEach((e) => {
        e.content.id = id;
        socket.send(e);
      });
      connect.close();
      return;
    }
    options.body = JSON.stringify({ latexExpression: latex });
    const response = [];
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
      response.push({
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
            response.push({ type: "solution", content: "error" });
          }
        })
      );
      response.push(msg);
      connect.run("INSERT OR IGNORE INTO solutions VALUES (?, ?)", [
        String(latex),
        JSON.stringify(response),
      ]);
      connect.close();
      socket.send(msg);
    }
  });
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});
app.get("/headless", (req, res) => {
  res.sendFile(__dirname + "/headless.html");
});
app.use(express.json({ limit: "50mb" }));
app.post("/screenshot", async (req, res) => {
  // 1. Launch the browser
  const browser = await puppeteer.launch({
    defaultViewport: {
      width: 480,
      height: 480,
    },
    args: ["--no-sandbox"],
  });

  // 2. Open a new page
  const page = await browser.newPage();

  // 3. Navigate to URL
  await page.goto("http://localhost:3000/headless");
  const upload = await page.$("#file");
  // Turn filetoUpload into a file
  const fileName = Math.random().toString(36).substring(7);
  await fs.mkdir("in").catch(() => 1);
  await fs.writeFile(`in/${fileName}.jpg`, req.body.file, {
    encoding: "base64",
  });
  // Convert to png
  await sharp(`in/${fileName}.jpg`).png().toFile(`in/${fileName}.png`);
  await upload.uploadFile(`in/${fileName}.png`);
  // Wait until finished id has the text finished
  await page.waitForSelector("#finished", { visible: true }).catch((e) => e);
  // 4. Take screenshot
  await page.screenshot({
    path: `out/${fileName}screenshot.png`,
    fullPage: true,
  });
  await browser.close();
  res.sendFile(__dirname + `/out/${fileName}screenshot.png`);
});
