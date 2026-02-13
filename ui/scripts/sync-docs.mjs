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

await syncDocs();
