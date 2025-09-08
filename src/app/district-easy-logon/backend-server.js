const express = require("express");
const { spawn } = require("child_process");
const cors = require("cors");
const path = require("path");

const app = express();
const port = 4334;

app.use(cors());
app.use(express.json());

app.post("/api/easy-logon", (req, res) => {
  const { userId, password } = req.body;

  const scriptPath = path.join(__dirname, "app.mjs");
  const args = [scriptPath, userId, password];

  console.log("Starting District Easy Logon...");

  const child = spawn("node", args, { cwd: __dirname });

  let stdout = "";
  let stderr = "";
  let hasEnded = false;

  child.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  child.stderr.on("data", (data) => {
    stderr += data.toString();
    console.error(`stderr: ${data}`);
  });

  child.on("close", (code) => {
    console.log(`Child process exited with code ${code}`);
    hasEnded = true;

    if (!res.headersSent) {
      if (code === 0) {
        res.json({
          success: true,
          message: "Login completed successfully",
          output: stdout,
          stderr: stderr,
        });
      } else {
        res.status(500).json({
          success: false,
          message: `Login failed with exit code ${code}`,
          output: stdout,
          stderr: stderr,
        });
      }
    }
  });

  child.on("error", (error) => {
    console.error(`Error: ${error}`);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message,
        output: stdout,
        stderr: stderr,
      });
    }
  });

  setTimeout(() => {
    if (!hasEnded && !res.headersSent) {
      res.json({
        success: true,
        message: "Login process started",
        processId: child.pid,
      });
    }
  }, 100);
});

app.get("/api/easy-logon/stream", (req, res) => {
  const { userId, password } = req.query;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
  });

  const scriptPath = path.join(__dirname, "app.mjs");
  const args = [scriptPath, userId, password];

  res.write(
    `data: ${JSON.stringify({
      type: "info",
      message: "Starting District Easy Logon process...",
      timestamp: new Date().toISOString(),
    })}\n\n`
  );

  const child = spawn("node", args, { cwd: __dirname });

  child.stdout.on("data", (data) => {
    const output = data.toString().trim();

    res.write(
      `data: ${JSON.stringify({
        type: "stdout",
        message: output,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
  });

  child.stderr.on("data", (data) => {
    const error = data.toString().trim();
    console.error(`stderr: ${error}`);

    res.write(
      `data: ${JSON.stringify({
        type: "stderr",
        message: error,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );
  });

  child.on("close", (code) => {
    console.log(`Child process exited with code ${code}`);

    res.write(
      `data: ${JSON.stringify({
        type: code === 0 ? "success" : "error",
        message:
          code === 0
            ? "Login process completed successfully"
            : `Login process failed with exit code ${code}`,
        exitCode: code,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    res.write('data: {"type": "end"}\n\n');
    res.end();
  });

  child.on("error", (error) => {
    console.error(`Process error: ${error}`);

    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message: `Process error: ${error.message}`,
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    res.write('data: {"type": "end"}\n\n');
    res.end();
  });

  req.on("close", () => {
    console.log("Client disconnected, gracefully terminating child process");

    child.kill("SIGTERM");

    setTimeout(() => {
      if (!child.killed) {
        console.log("Force killing child process");
        child.kill("SIGKILL");
      }
    }, 5000);
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(
    `District Easy Logon API server running at http://localhost:${port}`
  );
});
