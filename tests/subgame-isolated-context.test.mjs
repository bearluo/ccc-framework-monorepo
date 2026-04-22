import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

test('createSubgameGameContext isolates env/events/container from hostContext', async () => {
  const fwUrl = pathToFileURL(path.join(repoRoot, 'packages', 'fw', 'dist', 'index.js')).href;
  const fw = await import(fwUrl);

  const built = fw.buildApp({ env: { mode: 'dev', platform: 'web', flags: { a: true } } });
  const hostContext = built.context;

  const launchParams = fw.launchParamsFromHostEnv(hostContext.env);
  const gameContext = fw.createSubgameGameContext(launchParams);

  fw.assertSubgameContextsIsolated({ hostContext, launchParams }, gameContext);

  assert.notEqual(gameContext.env, hostContext.env);
  assert.notEqual(gameContext.events, hostContext.events);
  assert.notEqual(gameContext.container, hostContext.container);
});
