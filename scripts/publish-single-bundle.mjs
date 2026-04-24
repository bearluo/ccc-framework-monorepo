import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyDir, ensureDir, parseBuildIdFromBundleDir, rimraf, writeJson } from './lib/publish-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

const repoRoot = path.resolve(__dirname, '..');

const inDir = parseArg('--in');
const bundleName = parseArg('--bundle');

if (!inDir || !bundleName) {
  process.stderr.write(
    `Usage: node scripts/publish-single-bundle.mjs --in <apps/.../build/build-bundle/web-desktop/<bundleName>> --bundle <bundleName> [--out <remote-root>]\n`,
  );
  process.exit(2);
}

const outRoot = path.resolve(parseArg('--out') ?? path.join(repoRoot, 'remote-root'));
const bundleSrc = path.resolve(inDir);
const bundleDst = path.join(outRoot, 'bundles', bundleName);

await ensureDir(path.join(outRoot, 'bundles'));

// 清空目标（避免残留旧文件）
await rimraf(bundleDst);
await copyDir(bundleSrc, bundleDst);

// 生成 manifest.json（baseUrl 相对 remote-root 站点根）
const buildId = await parseBuildIdFromBundleDir(bundleDst);
const manifest = {
  bundles: {
    [bundleName]: {
      baseUrl: `bundles/${bundleName}`,
      version: buildId,
    },
  },
};

await writeJson(path.join(bundleDst, 'manifest.json'), manifest);

// 额外写入一个 publish-meta 便于排查（可选）
await writeJson(path.join(bundleDst, 'publish-meta.json'), {
  bundleName,
  buildId,
  publishedAt: new Date().toISOString(),
});

process.stderr.write(`published bundle: ${bundleName}\n`);
process.stderr.write(`src: ${bundleSrc}\n`);
process.stderr.write(`dst: ${bundleDst}\n`);
process.stderr.write(`version: ${buildId}\n`);

