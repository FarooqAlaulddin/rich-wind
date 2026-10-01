import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('Package contracts', () => {
  it('exports TypeScript declarations from package.json', () => {
    const pkg = readJson(path.join(repoRoot, 'package.json'));
    expect(pkg.types).toBe('./services/index.d.ts');
    expect(pkg.exports?.['.']?.types).toBe('./services/index.d.ts');

    const typesPath = path.join(repoRoot, pkg.types);
    expect(fs.existsSync(typesPath)).toBe(true);

    const declarations = fs.readFileSync(typesPath, 'utf8');
    expect(declarations).toContain('export declare function createCore');
  });

  it('includes the core OpenAPI paths', () => {
    const openapiPath = path.join(repoRoot, 'docs/openapi.json');
    const doc = readJson(openapiPath);

    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.paths?.['/api/compile']?.post).toBeTruthy();
    expect(doc.paths?.['/api/css']?.get).toBeTruthy();
    expect(doc.paths?.['/api/projects/{projectId}/css']?.get).toBeTruthy();
    expect(doc.paths?.['/api/suggest']?.post).toBeTruthy();
    expect(doc.paths?.['/health']?.get).toBeTruthy();
  });

  it('uses the closed error envelope for malformed requests and missing routes', async () => {
    const { createCore } = await import('../services/index.js');
    const { app, close } = await createCore();
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://localhost:${server.address().port}`;

    try {
      const malformed = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{'
      });
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toMatchObject({ code: 'INVALID_BODY', error: expect.any(String) });

      const missing = await fetch(`${baseUrl}/not-a-route`);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toMatchObject({ code: 'NOT_FOUND', error: expect.any(String) });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await close();
    }
  });
});
