# Creator Single-Bundle → remote-root Publish → per-bundle Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Creator “单 bundle 出包”产物（`apps/<game>/build/build-bundle/web-desktop/<bundleName>/`）一键发布到 `remote-root/bundles/<bundleName>/`，并在同目录生成 `manifest.json`（`baseUrl` 为相对 remote-root 站点根；`version` 从 `index.<buildId>.js` 解析，如 `cc094`），同时让静态服务器按文件类别返回合理缓存头。

**Architecture:** 在仓库根新增一个纯 Node 脚本 `scripts/publish-single-bundle.mjs` 完成“复制 + 生成 manifest +（可选）写入 README/日志”；静态服务 `scripts/serve-remote-root.mjs` 增加按路径/文件名的 Cache-Control 策略（`manifest/config/import` 走 `no-cache`，带 hash 的 `index.<id>.js` 走 `immutable`）。根 `package.json` 提供 `remote:publish`、`remote:serve`（已存在）与 `test:remote:publish`（node:test）验证输出结构与 version 解析。

**Tech Stack:** Node.js（内置 `fs/promises`、`path`、`node:test`），现有 `scripts/serve-remote-root.mjs` 静态服务器。

---

## File map（实现前锁定）

| Path | Responsibility |
|------|----------------|
| `scripts/publish-single-bundle.mjs` | 复制 bundle 到 `remote-root/bundles/<bundleName>/`，并生成 `manifest.json` |
| `scripts/lib/publish-utils.mjs` | 解析 buildId、递归复制、写 JSON（小而清晰） |
| `tests/publish-single-bundle.test.mjs` | node:test：用临时目录模拟输入产物，断言输出与 version 解析 |
| `scripts/serve-remote-root.mjs` | 增加缓存头：`no-cache` vs `immutable` |
| `package.json`（根） | 增加 `remote:publish`、`test:remote:publish` 脚本 |
| `remote-root/README.md` | 追加“bundles/<name>”布局与 manifest 说明（如需） |

---

### Task 1: 基础工具库（copy + buildId 解析 + JSON 写入）

**Files:**
- Create: `scripts/lib/publish-utils.mjs`

- [ ] **Step 1: 创建目录 `scripts/lib/`（若不存在）**

- [ ] **Step 2: 写入 `scripts/lib/publish-utils.mjs`（全文）**

```javascript
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
```

- [ ] **Step 3: 运行最小自检**

Run:

```bash
node -e "import('./scripts/lib/publish-utils.mjs').then(m=>console.log('ok', Object.keys(m)))"
```

Expected: `ok [...]` 且无异常。

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/publish-utils.mjs
git commit -m "feat(remote-root): add publish utilities"
```

---

### Task 2: 发布脚本 `publish-single-bundle.mjs`

**Files:**
- Create: `scripts/publish-single-bundle.mjs`

- [ ] **Step 1: 写入 `scripts/publish-single-bundle.mjs`（全文）**

```javascript
import path from 'node:path';
import fs from 'node:fs/promises';
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
```

- [ ] **Step 2: 使用真实目录冒烟（以 game-template 为例）**

Run（仓库根）:

```bash
node scripts/publish-single-bundle.mjs ^
  --in apps/game-template/build/build-bundle/web-desktop/game-template ^
  --bundle game-template
```

Expected:
- 生成 `remote-root/bundles/game-template/config.json`
- 生成 `remote-root/bundles/game-template/manifest.json`
- `manifest.json` 中 `baseUrl` 为 `bundles/game-template`

- [ ] **Step 3: Commit**

```bash
git add scripts/publish-single-bundle.mjs
git commit -m "feat(remote-root): add single-bundle publish script"
```

---

### Task 3: 服务器缓存头策略（按 spec）

**Files:**
- Modify: `scripts/serve-remote-root.mjs`

- [ ] **Step 1: 增加一个 helper：按请求路径决定 Cache-Control**

在 `sendFile` 内 `cors` 头之后、`writeHead` 之前，加入：

```javascript
function cacheControlForUrlPath(urlPath) {
  const p = urlPath.toLowerCase();
  // 不缓存：manifest/config/import 索引类
  if (p.endsWith('/manifest.json') || p.endsWith('/config.json')) return 'no-cache';
  if (p.includes('/import/')) return 'no-cache';
  if (p.endsWith('/publish-meta.json')) return 'no-cache';

  // 强缓存：index.<hash>.js
  if (/\\/index\\.[a-z0-9_-]+\\.js$/.test(p)) return 'public, max-age=31536000, immutable';

  // 默认：短缓存 + 重新验证
  return 'public, max-age=60';
}
```

并在所有 `writeHead` 分支里附加：`'Cache-Control': cacheControlForUrlPath(url.pathname)`。

> 说明：本服务器当前实现里已经解析了 URL pathname；若没有保留 pathname，需要把 pathname 传入 sendFile（不要用文件系统 path 代替 URL path）。

- [ ] **Step 2: 添加一个快速手测用例**

启动服务后：

```bash
curl -I http://127.0.0.1:8787/bundles/game-template/manifest.json
curl -I http://127.0.0.1:8787/bundles/game-template/import/0f/0faf3413-7477-41ed-aae2-37252d511171.json
```

Expected: `Cache-Control: no-cache`

- [ ] **Step 3: Commit**

```bash
git add scripts/serve-remote-root.mjs
git commit -m "feat(remote-root): add cache-control headers for bundles"
```

---

### Task 4: node:test 覆盖关键逻辑（version 解析 + manifest 格式）

**Files:**
- Create: `tests/publish-single-bundle.test.mjs`
- Modify: `package.json`（根）

- [ ] **Step 1: 写入测试文件（全文）**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

  const script = pathToFileURL(path.join(repoRoot, 'scripts', 'publish-single-bundle.mjs')).href;
  await import('node:child_process').then(({ spawnSync }) => {
    const r = spawnSync(process.execPath, [new URL(script).pathname, '--in', bundleIn, '--bundle', bundle, '--out', outRoot], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr || r.stdout);
  });

  const manifestPath = path.join(outRoot, 'bundles', bundle, 'manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf8');
  const json = JSON.parse(raw);
  assert.equal(json.bundles[bundle].baseUrl, `bundles/${bundle}`);
  assert.equal(json.bundles[bundle].version, 'cc094');
});
```

- [ ] **Step 2: 根 `package.json` 添加脚本**

```json
{
  "scripts": {
    "test:remote:publish": "node --test tests/publish-single-bundle.test.mjs"
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test:remote:publish
```

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add tests/publish-single-bundle.test.mjs package.json
git commit -m "test(remote-root): cover publish script and buildId parsing"
```

---

### Task 5: 文档对齐（可选但建议）

**Files:**
- Modify: `remote-root/README.md`

- [ ] **Step 1: 追加一节 bundles/manifest 说明**

追加：

```markdown
## bundles 发布结构（单 bundle）

发布到：

`remote-root/bundles/<bundleName>/`

并生成：

`remote-root/bundles/<bundleName>/manifest.json`

其中 `baseUrl` 使用相对路径 `bundles/<bundleName>`，`version` 从 `index.<buildId>.js` 解析（如 `cc094`）。
```

- [ ] **Step 2: Commit**

```bash
git add remote-root/README.md
git commit -m "docs(remote-root): document bundles/<name>/manifest.json layout"
```

---

## Self-review（对照 spec）

**Spec coverage:**
- 目录结构：Task 2 输出到 `remote-root/bundles/<name>/`（spec §4/§5）
- `manifest.json`：Task 2 生成（spec §5）
- `version` 解析：Task 1 + Task 4 测试（spec §5.3）
- 缓存策略：Task 3（spec §7）

**Placeholder scan:** 无 TBD；每步含完整脚本与可执行命令。

**Type consistency:** `version`=buildId；`baseUrl` 相对站点根 `bundles/<name>`。

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-23-creator-single-bundle-remote-root-manifest.md`. Two execution options:**

**1. Subagent-Driven（推荐）** — 每个 Task 派生子代理执行，Task 间 review。  
**2. Inline Execution** — 在本会话按 Task 顺序执行。

**Which approach?**

