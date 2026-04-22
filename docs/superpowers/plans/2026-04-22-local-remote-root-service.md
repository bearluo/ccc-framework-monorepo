# Local `remote-root` HTTP Static Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 monorepo 根提供 `remote-root/` 目录与本地 **HTTP 静态下载服务**（含 CORS、可选 Range），使 `host` / `game-template` 等可通过 `http://127.0.0.1:<port>/...` 拉取打包后的 remote bundle。

**Architecture:** 使用 **零额外 npm 依赖** 的 Node 内置 `http`/`fs`/`path` 实现单文件静态服务脚本；仓库根 `package.json` 增加 `npm run remote:serve` 入口；`remote-root/` 用 `.gitignore` 忽略产物但保留说明与占位；用 `node:test` 做冒烟 HTTP 测试。

**Tech Stack:** Node.js（建议 ≥18，内置 `node:test`）、ESM（`"type": "module"` 仅作用于脚本文件扩展名 `.mjs` 即可，无需改根 package type）。

---

## File map（实现前锁定）

| 路径 | 职责 |
|------|------|
| `remote-root/README.md` | 说明推荐目录分层、示例 URL、如何把 Creator 构建产物拷入 |
| `remote-root/.gitkeep` | 保证空目录可被 git 跟踪（若 `.gitignore` 规则需要则保留） |
| `.gitignore` | 忽略 `remote-root/` 下大文件，但允许 `README.md` / `.gitkeep` |
| `scripts/serve-remote-root.mjs` | 静态 HTTP 服务：GET/HEAD、MIME、路径穿越防护、CORS、Range |
| `tests/serve-remote-root.test.mjs` | 启动服务、请求文件、`Range` 与 CORS 头断言 |
| `package.json`（根） | `scripts.remote:serve`、`scripts.test:remote-root`（或并入现有 test 策略） |

---

### Task 1: `remote-root` 目录与文档

**Files:**
- Create: `remote-root/README.md`
- Create: `remote-root/.gitkeep`

- [ ] **Step 1: 写入 `remote-root/README.md`**

```markdown
# remote-root（本地 HTTP 远端资源根）

本目录由本地静态服务托管，站点根即本目录。URL：

`http://127.0.0.1:<PORT>/<相对本目录的路径>`

推荐布局：

`remote-root/<game>/<platform>/<version>/...`

示例：将 `game-template` 的 Web remote bundle 放到

`remote-root/game-template/web-desktop/dev/`

则可通过：

`http://127.0.0.1:8787/game-template/web-desktop/dev/<bundle内相对路径>`

启动服务（仓库根）：

`npm run remote:serve`
```

- [ ] **Step 2: 创建空占位**

创建文件 `remote-root/.gitkeep`，内容为空即可。

- [ ] **Step 3: Commit**

```bash
git add remote-root/README.md remote-root/.gitkeep
git commit -m "docs: add remote-root layout readme"
```

---

### Task 2: `.gitignore` 规则（忽略产物、保留说明）

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 在 `.gitignore` 末尾追加以下块**

```gitignore
# Local remote bundle outputs (large); keep README + placeholder
remote-root/**
!remote-root/README.md
!remote-root/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore remote-root bundle outputs"
```

---

### Task 3: 实现 `scripts/serve-remote-root.mjs`

**Files:**
- Create: `scripts/serve-remote-root.mjs`

- [ ] **Step 1: 写入完整脚本（复制以下全文）**

```javascript
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.bin': 'application/octet-stream',
  '.br': 'application/octet-stream',
  '.gz': 'application/gzip',
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function parsePort(argv) {
  const i = argv.indexOf('--port');
  if (i !== -1 && argv[i + 1]) return Number(argv[i + 1]);
  const env = Number(process.env.PORT);
  return Number.isFinite(env) && env > 0 ? env : 8787;
}

function parseRoot(argv) {
  const i = argv.indexOf('--root');
  if (i !== -1 && argv[i + 1]) return path.resolve(argv[i + 1]);
  return path.resolve(__dirname, '..', 'remote-root');
}

function isPathInsideRoot(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;
  const part = rangeHeader.slice('bytes='.length);
  const [startStr, endStr] = part.split('-', 2);
  if (!startStr) return null;
  const start = Number(startStr);
  if (!Number.isFinite(start) || start < 0 || start >= size) return null;
  const end = endStr ? Number(endStr) : size - 1;
  if (!Number.isFinite(end) || end < start || end >= size) return null;
  return { start, end };
}

async function sendFile(req, res, filePath, method) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const size = stat.size;
  const type = contentType(filePath);

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };

  if (method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (method === 'HEAD') {
    res.writeHead(200, { ...cors, 'Content-Type': type, 'Content-Length': String(size) });
    res.end();
    return;
  }

  if (method !== 'GET') {
    res.writeHead(405, { ...cors, Allow: 'GET, HEAD, OPTIONS' });
    res.end('Method Not Allowed');
    return;
  }

  const range = parseRange(req.headers.range, size);
  if (range) {
    const { start, end } = range;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      ...cors,
      'Content-Type': type,
      'Content-Length': String(chunkSize),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    ...cors,
    'Content-Type': type,
    'Content-Length': String(size),
    'Accept-Ranges': 'bytes',
  });
  fs.createReadStream(filePath).pipe(res);
}

const rootDir = parseRoot(process.argv.slice(2));
const port = parsePort(process.argv.slice(2));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }

    const safePath = path.normalize(path.join(rootDir, pathname));
    if (!isPathInsideRoot(rootDir, safePath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    await sendFile(req, res, safePath, req.method ?? 'GET');
  } catch (e) {
    if ((e && e.code) === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stderr.write(`remote-root static server\n`);
  process.stderr.write(`root: ${rootDir}\n`);
  process.stderr.write(`url:  http://127.0.0.1:${port}/\n`);
});
```

- [ ] **Step 2: 手动冒烟（可选但建议）**

在 `remote-root/game-template/web-desktop/dev/` 下放一个 `hello.txt`，然后：

```bash
node scripts/serve-remote-root.mjs --port 8787
```

另开终端：

```bash
curl -i http://127.0.0.1:8787/game-template/web-desktop/dev/hello.txt
```

Expected: `HTTP/1.1 200`，body 为文件内容；响应头含 `Access-Control-Allow-Origin: *`。

- [ ] **Step 3: Commit**

```bash
git add scripts/serve-remote-root.mjs
git commit -m "feat: add remote-root static http server script"
```

---

### Task 4: 根 `package.json` 脚本入口

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 在 `scripts` 对象中增加两项**

```json
{
  "scripts": {
    "remote:serve": "node scripts/serve-remote-root.mjs",
    "test:remote-root": "node --test tests/serve-remote-root.test.mjs"
  }
}
```

注意：与现有 `build`/`watch` 键合并，不要删除原有脚本。

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add remote:serve npm script"
```

---

### Task 5: `node:test` 冒烟测试

**Files:**
- Create: `tests/serve-remote-root.test.mjs`

- [ ] **Step 1: 写入测试文件（复制以下全文）**

```javascript
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
```

- [ ] **Step 2: 运行测试**

```bash
cd e:\bearluo\ccc-framework-monorepo
npm run test:remote-root
```

Expected: 测试通过（exit code 0）。

- [ ] **Step 3: Commit**

```bash
git add tests/serve-remote-root.test.mjs
git commit -m "test: smoke remote-root static server"
```

---

### Task 6: `host` manifest 对齐示例（文档性，不改业务默认值）

**Files:**
- Modify: `remote-root/README.md`（追加一小节即可）

- [ ] **Step 1: 在 README 末尾追加**

```markdown
## 与 host manifest 对齐

若 manifest 中 `baseUrl` 为相对路径 `update`，请把内容放到：

`remote-root/update/`

并把运行时 base 配成：

`http://127.0.0.1:8787/update`

若使用推荐分层，则 `baseUrl` 指向：

`http://127.0.0.1:8787/game-template/web-desktop/dev`
```

- [ ] **Step 2: Commit**

```bash
git add remote-root/README.md
git commit -m "docs: clarify manifest baseUrl vs remote-root paths"
```

---

## Self-review（对照 spec）

**1. Spec coverage**

| Spec 要求 | 对应 Task |
|-----------|-----------|
| `remote-root/` 统一根 | Task 1 |
| HTTP GET 静态下载 | Task 3 |
| Content-Type | Task 3 `MIME` |
| Range（建议） | Task 3 `parseRange` + Task 5 断言 |
| CORS（Web） | Task 3 + Task 5 |
| 与 manifest / `update` 兼容说明 | Task 6 |
| 不把大文件提交进 git | Task 2 |

**2. Placeholder scan**

无 `TBD`；各步骤含可执行命令与完整脚本/测试代码。

**3. 已知注意点**

- `sendFile(req, res, ...)` 从 `req.headers.range` 读取 Range；若需进一步解耦，可把 `rangeHeader` 作为独立参数传入。
- Windows 路径：测试中 URL 使用 `rel.split(path.sep).join('/')`，避免反斜杠 URL。

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-22-local-remote-root-service.md`. Two execution options:**

**1. Subagent-Driven（推荐）** — 每个 Task 派生子代理执行，Task 间人工快速 review。

**2. Inline Execution** — 在本会话按 Task 顺序执行，并在关键 Task 后设检查点。

**Which approach?**
