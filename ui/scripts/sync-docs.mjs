import { watch } from "node:fs";
import { mkdir, rm, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const docsSource = path.join(repoRoot, "docs");
const publicDocs = path.join(repoRoot, "ui", "public", "docs");

async function syncDocs() {
  try {
    await rm(publicDocs, { recursive: true, force: true });
    await mkdir(publicDocs, { recursive: true });
    await cp(docsSource, publicDocs, { recursive: true });
  } catch (error) {
    console.error("Failed to sync docs:", error);
    process.exitCode = 1;
  }
}

async function watchDocs() {
  await syncDocs();
  console.log("Watching docs for changes...");

  let timer = null;
  let running = false;
  let queued = false;

  const runSync = async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    await syncDocs();
    running = false;
    if (queued) {
      queued = false;
      await runSync();
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      runSync();
    }, 100);
  };

  let watcher;
  try {
    watcher = watch(docsSource, { persistent: true, recursive: true }, () => {
      schedule();
    });
  } catch {
    watcher = watch(docsSource, { persistent: true }, () => {
      schedule();
    });
  }

  const shutdown = () => {
    try {
      watcher.close();
    } catch {}
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const watchMode = process.argv.includes("--watch");
if (watchMode) {
  await watchDocs();
} else {
  await syncDocs();
}
