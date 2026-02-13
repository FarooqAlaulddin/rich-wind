import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiRoot = path.resolve(__dirname, "..");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const children = [];
let shuttingDown = false;

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    try {
      if (!child.killed) child.kill("SIGTERM");
    } catch {}
  }

  setTimeout(() => {
    for (const child of children) {
      try {
        if (!child.killed) child.kill("SIGKILL");
      } catch {}
    }
  }, 1500).unref();

  setTimeout(() => process.exit(exitCode), 10);
}

function spawnChild(command, args, name) {
  const child = spawn(command, args, {
    cwd: uiRoot,
    stdio: "inherit",
    env: process.env,
  });
  children.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (signal) {
      console.error(`${name} exited from signal ${signal}`);
      stopAll(1);
      return;
    }
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
      stopAll(code || 1);
      return;
    }
    // If one subprocess exits cleanly, stop the other so dev command doesn't hang.
    stopAll(0);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

spawnChild(process.execPath, ["./scripts/sync-docs.mjs", "--watch"], "docs-sync");
spawnChild(npmCmd, ["run", "dev:app"], "react-router-dev");
