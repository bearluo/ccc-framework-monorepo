import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

test('publish-single-bundle writes manifest with buildId from index.<id>.js', async () => {
  const tmp = path.join(repoRoot, '.tmp-test-publish');
  const inDir = path.join(tmp, 'in');
  const outRoot = path.join(tmp, 'out');
  const bundle = 'game-template';
  const bundleIn = path.join(inDir, bundle);

  await fs.rm(tmp, { recursive: true, force: true });
  await fs.mkdir(path.join(bundleIn, 'import'), { recursive: true });
  await fs.writeFile(path.join(bundleIn, 'config.json'), '{}', 'utf8');
  await fs.writeFile(path.join(bundleIn, 'index.cc094.js'), '/*x*/', 'utf8');
  await fs.writeFile(path.join(bundleIn, 'import', 'a.json'), '[]', 'utf8');

  const r = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'publish-single-bundle.mjs'), '--in', bundleIn, '--bundle', bundle, '--out', outRoot],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);

  const manifestPath = path.join(outRoot, 'bundles', bundle, 'manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf8');
  const json = JSON.parse(raw);
  assert.equal(json.bundles[bundle].baseUrl, `bundles/${bundle}`);
  assert.equal(json.bundles[bundle].version, 'cc094');
});

