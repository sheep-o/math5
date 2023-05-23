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
const dotenv = require("dotenv");
const { rm, existsSync } = require("fs");
fs.mkdir("database").catch(() => 1);
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
    if (img.search("data:image/png;base64,") !== -1) {
      await fs
        .writeFile(fileName, img.replace("data:image/png;base64,", ""), {
          encoding: "base64",
        })
        .catch((e) => e);
    } else {
      await fs
        .writeFile(fileName, img.replace("data:image/jpeg;base64,", ""), {
          encoding: "base64",
        })
        .catch((e) => e);
    }
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
              let length = text.replaceAll(/[^a-zA-Z]/g, "").length;
              if (length < 3) {
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
          result: "Please set the MICROSOFT environment variable",
          finished: true,
          id,
        },
      });
      console.log("Set the MICROSOFT environment variable");
      return;
    }
    const connect = await open({
      filename: "database/db.db",
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
      const answer = answers[0].answer;
      socket.send({
        type: "answer",
        content: { result: answer, id, question, finished: true },
      });
      connect.close();
      return;
    }
    const { BingChat } = await import("bing-chat");
    const api = new BingChat({ cookie: process.env.MICROSOFT });
    let lastMessage = 0;
    const result = (
      await api
        .sendMessage(question, {
          onProgress: (partialResponse) => {
            if (Date.now() - lastMessage < 500) return;
            lastMessage = Date.now();
            socket.send({
              type: "answer",
              content: {
                result: partialResponse.text,
                question,
                id,
                finished: false,
              },
            });
          },
        })
        .catch((e) => {
          console.log("Failed to get answer from bing");
          return { text: "" };
        })
    ).text;
    socket.send({
      type: "answer",
      content: { result, question, id, finished: true },
    });
    if (result !== "") {
      connect.run("INSERT OR IGNORE INTO answers VALUES (?, ?)", [
        String(question),
        result,
      ]);
    }
    connect.close();
  });
  socket.on("solve", async ({ latex, id }) => {
    const connect = await open({
      filename: "database/db.db",
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
  const puppeteer = require("puppeteer");
  const sharp = require("sharp");
  // 1. Launch the browser
  const browser = await puppeteer.launch({
    defaultViewport: {
      width: 480,
      height: 480,
    },
    args: ["--no-sandbox"],
  });
  const fileName = Math.random().toString(36).substring(7);
  console.log("New screenshot: ", fileName);
  // 2. Open a new page
  const page = await browser.newPage();
  // 3. Navigate to URL
  await page.goto("http://localhost:3000/headless");
  const upload = await page.$("#file");
  // Turn filetoUpload into a file
  await fs.mkdir("in").catch(() => 1);
  await fs.writeFile(`in/${fileName}.jpg`, req.body.file, {
    encoding: "base64",
  });
  // Convert to png
  await sharp(`in/${fileName}.jpg`).png().toFile(`in/${fileName}.png`);
  await upload.uploadFile(`in/${fileName}.png`);
  // 4. Take screenshot
  await page.screenshot({
    path: `out/${fileName}screenshot.png`,
    fullPage: true,
  });
  res.send(fileName);
  // Wait until finished id has the text finished
  counter = 0;
  started = false;
  while (counter < 120) {
    counter += 1;
    await new Promise((res) => setTimeout(res, 1000));
    // 4. Take screenshot
    await page.screenshot({
      path: `out/${fileName}screenshot.png`,
      fullPage: true,
    });
    if (
      await page.evaluate(() => {
        return (
          progress.solution <= 0 &&
          progress.latex <= 0 &&
          progress.bing <= 0 &&
          progress.bing <= 0
        );
      })
    ) {
      if (started) {
        break;
      }
    } else if (!started) {
      started = true;
    }
  }
  await browser.close();
  await new Promise((res) => setTimeout(res, 5000));
  rm(__dirname + `/out/${fileName}screenshot.png`, () => {});
  console.log("Finished screenshot: ", fileName);
});

app.get("/screenshot", async (req, res) => {
  const fileName = req.query.fileName;
  if (!fileName) {
    res.send("No file name");
    return;
  }
  // Checks if file exist
  if (!existsSync(__dirname + `/out/${fileName}screenshot.png`)) {
    res.statusCode = 404;
    res.send("File not found");
    return;
  }
  res.sendFile(__dirname + `/out/${fileName}screenshot.png`);
});
