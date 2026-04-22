import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers }, (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      })
      .on('error', reject);
  });
}

test('remote-root server serves file with CORS + range', async (t) => {
  const root = path.join(repoRoot, 'remote-root');
  const rel = path.join('game-template', 'web-desktop', 'dev', 'hello.txt');
  const filePath = path.join(root, rel);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const payload = Buffer.from('hello-remote-root');
  await fsp.writeFile(filePath, payload);

  t.after(async () => {
    await fsp.rm(filePath, { force: true });
  });

  const port = 18787;
  const child = spawn(process.execPath, [path.join(repoRoot, 'scripts', 'serve-remote-root.mjs'), '--port', String(port)], {
    cwd: repoRoot,
    stdio: 'ignore',
  });

  t.after(() => {
    child.kill('SIGTERM');
  });

  await new Promise((r) => setTimeout(r, 250));

  const url = `http://127.0.0.1:${port}/${rel.split(path.sep).join('/')}`;
  const full = await httpGet(url);
  assert.equal(full.status, 200);
  assert.equal(full.headers['access-control-allow-origin'], '*');
  assert.equal(full.body.toString('utf8'), 'hello-remote-root');

  const ranged = await httpGet(url, { Range: 'bytes=0-4' });
  assert.equal(ranged.status, 206);
  assert.match(String(ranged.headers['content-range'] ?? ''), /^bytes 0-4\//);
  assert.equal(ranged.body.toString('utf8'), 'hello');
});
