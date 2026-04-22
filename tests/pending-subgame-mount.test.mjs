import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

test('pending mount is single-flight', async () => {
  const fwUrl = pathToFileURL(path.join(repoRoot, 'packages', 'fw', 'dist', 'index.js')).href;
  const fw = await import(fwUrl);

  const built = fw.buildApp({ env: { mode: 'dev' } });
  const hostContext = built.context;
  const launchParams = { mode: 'dev' };

  fw.setPendingSubgameMount({ hostContext, launchParams });
  assert.throws(() => fw.setPendingSubgameMount({ hostContext, launchParams }), /single-flight/);

  const p1 = fw.consumePendingSubgameMount();
  assert.equal(p1.hostContext, hostContext);

  assert.throws(() => fw.consumePendingSubgameMount(), /No pending/);
});
