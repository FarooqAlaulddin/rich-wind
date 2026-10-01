import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function run(cmd, args, cwd = repoRoot) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

let tarballPath = null;
let tempDir = null;

try {
  const packJson = run('npm', ['pack', '--json']);
  const packResult = JSON.parse(packJson);
  const tarballName = packResult?.[0]?.filename;
  if (!tarballName) {
    throw new Error(`Unable to parse tarball name from npm pack output: ${packJson}`);
  }

  tarballPath = path.join(repoRoot, tarballName);
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rich-wind-pack-smoke-'));

  run('npm', ['init', '-y'], tempDir);
  run('npm', ['install', '--no-package-lock', '--ignore-scripts', tarballPath], tempDir);

  const smokeCode = `
import { createCore } from 'rich-wind';
import { createAutoPromotePlugin } from 'rich-wind/plugins/auto-promote';
import { createFsCacheStore } from 'rich-wind/plugins/cache-store-fs';

if (typeof createAutoPromotePlugin !== 'function' || typeof createFsCacheStore !== 'function') {
  throw new Error('Plugin subpath exports are unavailable.');
}

const { handler, close } = await createCore({});
const server = http.createServer(handler).listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const { port } = server.address();

const response = await fetch(\`http://localhost:\${port}/health\`);
if (response.status !== 200) {
  throw new Error(\`Unexpected health status: \${response.status}\`);
}

await new Promise((resolve) => server.close(resolve));
await close();
`;

  run(process.execPath, ['--input-type=module', '-e', smokeCode], tempDir);
  console.log('Pack smoke test passed.');
} catch (error) {
  console.error('Pack smoke test failed.');
  console.error(error?.stdout || '');
  console.error(error?.stderr || error?.message || String(error));
  process.exitCode = 1;
} finally {
  if (tarballPath && existsSync(tarballPath)) {
    unlinkSync(tarballPath);
  }
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
