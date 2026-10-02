import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function responseValidator(schemaName) {
  const doc = readJson(path.join(repoRoot, 'docs/openapi.json'));
  doc.$id = 'https://richwind.dev/openapi.json';
  const ajv = new Ajv({ strict: false });
  ajv.addSchema(doc);
  return ajv.getSchema(`${doc.$id}#/components/schemas/${schemaName}`);
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
    const { handler, close } = await createCore();
    const server = http.createServer(handler).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://localhost:${server.address().port}`;

    try {
      const malformed = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{'
      });
      expect(malformed.status).toBe(400);
      const validateError = responseValidator('ErrorResponse');
      const malformedBody = await malformed.json();
      expect(validateError(malformedBody), JSON.stringify(validateError.errors)).toBe(true);
      expect(malformedBody).toMatchObject({ code: 'INVALID_BODY', error: expect.any(String) });

      const missing = await fetch(`${baseUrl}/not-a-route`);
      expect(missing.status).toBe(404);
      const missingBody = await missing.json();
      expect(validateError(missingBody), JSON.stringify(validateError.errors)).toBe(true);
      expect(missingBody).toMatchObject({ code: 'NOT_FOUND', error: expect.any(String) });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await close();
    }
  });

  it('validates live compile success and payload errors against OpenAPI schemas', async () => {
    const { createCore } = await import('../services/index.js');
    const { handler, close } = await createCore();
    const server = http.createServer(handler).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://localhost:${server.address().port}`;
    try {
      const success = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'contract', classes: 'p-4' })
      });
      const validateSuccess = responseValidator('CompileSuccessResponse');
      const successBody = await success.json();
      expect(validateSuccess(successBody), JSON.stringify(validateSuccess.errors)).toBe(true);

      const oversized = await fetch(`${baseUrl}/api/compile`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'contract-too-large', html: 'x'.repeat(60000) })
      });
      expect(oversized.status).toBe(413);
      const validateError = responseValidator('ErrorResponse');
      expect(validateError(await oversized.json()), JSON.stringify(validateError.errors)).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await close();
    }
  });
});
