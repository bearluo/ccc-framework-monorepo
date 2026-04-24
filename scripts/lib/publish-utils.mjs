import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function rimraf(target) {
  await fs.rm(target, { recursive: true, force: true });
}

export async function copyDir(src, dst) {
  const stat = await fs.stat(src);
  if (!stat.isDirectory()) throw new Error(`copyDir: src is not a directory: ${src}`);
  await ensureDir(dst);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    const from = path.join(src, ent.name);
    const to = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyDir(from, to);
    else if (ent.isFile()) await fs.copyFile(from, to);
  }
}

/**
 * 从 bundle 目录中解析 buildId：
 * - 优先匹配 index.<buildId>.js（如 index.cc094.js）
 * - 否则 fallback 为 "dev"
 */
export async function parseBuildIdFromBundleDir(bundleDir) {
  const entries = await fs.readdir(bundleDir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const re = /^index\.([a-zA-Z0-9_-]+)\.js$/;
  for (const f of files) {
    const m = re.exec(f);
    if (m) return m[1];
  }
  return 'dev';
}

export async function writeJson(filePath, obj) {
  await ensureDir(path.dirname(filePath));
  const body = JSON.stringify(obj, null, 2) + '\n';
  await fs.writeFile(filePath, body, 'utf8');
}

