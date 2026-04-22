# Cross-Project Bundle Load + Dual Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `@ccc/fw` 中提供 **子游戏隔离 `gameContext` 工厂**、**Host→子游戏一次性挂载载荷（含 `hostContext` + `launchParams`）** 与 **Creator 场景激活前可消费的 pending registry**；在 `apps/host` 演示从 `hostContext` 快照生成 `launchParams` 并在 `runScene` 前投递挂载载荷；用 **Node 内置测试** 验证 `env`/`events`/`container` 与 `hostContext` 引用级隔离。

**Architecture:** 纯逻辑放 `packages/fw/src/subgame/*` 并从 `src/index.ts` 导出；Host 在 `director.runScene` 前调用 `setPendingSubgameMount`；子游戏首场景根组件 `onLoad` 内 `consumePendingSubgameMount` 并创建 `gameContext`。`launchParams` 使用已有 `CreateEnvOptions` 类型，由 `launchParamsFromHostEnv` 从 `hostContext.env` **值拷贝**生成，避免共享 `Env` 引用。

**Tech Stack:** TypeScript、`@ccc/fw` Rollup 构建、Node `node:test`（仓库根运行）、Cocos Creator 3.8.x（Host/子游戏工程内脚本与场景约定）。

---

## File map

| 路径 | 职责 |
|------|------|
| `packages/fw/src/subgame/types.ts` | `SubgameMountPayload` 等类型 |
| `packages/fw/src/subgame/create-subgame-game-context.ts` | `createSubgameGameContext`：新 `Container` + 新 `EventBus` + `createEnv(launchParams)` + `createContext` |
| `packages/fw/src/subgame/launch-params.ts` | `launchParamsFromHostEnv`：从 `Env` 只读字段生成 `CreateEnvOptions`（不返回 `Env` 引用） |
| `packages/fw/src/subgame/pending-subgame-mount.ts` | `setPendingSubgameMount` / `consumePendingSubgameMount`（单次消费） |
| `packages/fw/src/subgame/index.ts` | barrel 导出 |
| `packages/fw/src/index.ts` | `export * from './subgame'`（或等价导出） |
| `tests/subgame-isolated-context.test.mjs` | 引用隔离单测（import `packages/fw/dist/index.js`） |
| `tests/pending-subgame-mount.test.mjs` | pending registry 单测 |
| `apps/host/assets/demo/app-dev.ts` | 演示：`launchParamsFromHostEnv` + `setPendingSubgameMount` + `loadScene` + `runScene` |
| `docs/superpowers/specs/2026-04-23-cross-project-bundle-context-design.md` | 对照规格（不改内容，仅在 PR 描述引用） |

---

### Task 1: `CreateEnvOptions` 快照 helper

**Files:**
- Create: `packages/fw/src/subgame/launch-params.ts`
- Modify: `packages/fw/src/subgame/index.ts`（Task 4 一并创建时可跳过；若本任务单独提交则先创建单文件再从 index 导出）

- [ ] **Step 1: 新增 `launch-params.ts`（全文）**

```typescript
import type { CreateEnvOptions } from '../env';
import type { Env } from '../env';

/**
 * 从 Host 的 Env 读取“值”，生成子游戏侧 `createEnv` 的入参。
 * 不返回、不引用 Host 的 Env 对象本身。
 *
 * 注意：`flags` 的可枚举快照不在此函数推导（需要 Host 显式提供 map 或扩展协议时再升级）。
 */
export function launchParamsFromHostEnv(env: Env): CreateEnvOptions {
  return {
    mode: env.mode,
    platform: env.platform,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/fw/src/subgame/launch-params.ts
git commit -m "feat(fw): add launchParamsFromHostEnv snapshot helper"
```

---

### Task 2: `createSubgameGameContext`

**Files:**
- Create: `packages/fw/src/subgame/create-subgame-game-context.ts`
- Create: `packages/fw/src/subgame/types.ts`

- [ ] **Step 1: 新增 `types.ts`（全文）**

```typescript
import type { Context } from '../context';
import type { CreateEnvOptions } from '../env';

export type SubgameMountPayload = {
  hostContext: Context;
  launchParams: CreateEnvOptions;
};
```

- [ ] **Step 2: 新增 `create-subgame-game-context.ts`（全文）**

```typescript
import { createContext, type Context } from '../context';
import { Container } from '../di';
import { createEnv } from '../env';
import type { CreateEnvOptions } from '../env';
import { EventBus, type EventMap } from '../event';
import type { SubgameMountPayload } from './types';

export function createSubgameGameContext<Events extends EventMap = EventMap>(
  launchParams: CreateEnvOptions,
): Context<Events> {
  const env = createEnv(launchParams);
  const container = new Container();
  const events = new EventBus<Events>();
  return createContext<Events>({ env, container, events });
}

export function assertSubgameContextsIsolated(payload: SubgameMountPayload, gameContext: Context): void {
  if (gameContext.env === payload.hostContext.env) {
    throw new Error('Invariant violated: gameContext.env must not share reference with hostContext.env');
  }
  if (gameContext.events === payload.hostContext.events) {
    throw new Error('Invariant violated: gameContext.events must not share reference with hostContext.events');
  }
  if (gameContext.container === payload.hostContext.container) {
    throw new Error('Invariant violated: gameContext.container must not share reference with hostContext.container');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/fw/src/subgame/types.ts packages/fw/src/subgame/create-subgame-game-context.ts
git commit -m "feat(fw): add createSubgameGameContext and isolation assert"
```

---

### Task 3: Pending mount registry（解决 runScene 前难遍历场景的问题）

**Files:**
- Create: `packages/fw/src/subgame/pending-subgame-mount.ts`

- [ ] **Step 1: 新增 `pending-subgame-mount.ts`（全文）**

```typescript
import type { SubgameMountPayload } from './types';

let pending: SubgameMountPayload | undefined;

export function setPendingSubgameMount(payload: SubgameMountPayload): void {
  if (pending) {
    throw new Error('Pending subgame mount already set (single-flight)');
  }
  pending = payload;
}

export function consumePendingSubgameMount(): SubgameMountPayload {
  if (!pending) {
    throw new Error('No pending subgame mount payload');
  }
  const p = pending;
  pending = undefined;
  return p;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/fw/src/subgame/pending-subgame-mount.ts
git commit -m "feat(fw): add pending subgame mount registry"
```

---

### Task 4: Barrel + `index.ts` 导出

**Files:**
- Create: `packages/fw/src/subgame/index.ts`
- Modify: `packages/fw/src/index.ts`

- [ ] **Step 1: 新增 `packages/fw/src/subgame/index.ts`（全文）**

```typescript
export type { SubgameMountPayload } from './types';
export { createSubgameGameContext, assertSubgameContextsIsolated } from './create-subgame-game-context';
export { launchParamsFromHostEnv } from './launch-params';
export { setPendingSubgameMount, consumePendingSubgameMount } from './pending-subgame-mount';
```

- [ ] **Step 2: 在 `packages/fw/src/index.ts` 末尾追加**

```typescript
export * from './subgame';
```

- [ ] **Step 3: 重建 fw**

```bash
cd e:\bearluo\ccc-framework-monorepo\packages\fw
npm run build
```

Expected: `created dist in` 且 `dist/index.d.ts` 出现 `createSubgameGameContext` 等导出。

- [ ] **Step 4: Commit**

```bash
git add packages/fw/src/subgame/index.ts packages/fw/src/index.ts
git commit -m "feat(fw): export subgame mount helpers"
```

---

### Task 5: Node 单测（隔离 + pending）

**Files:**
- Create: `tests/subgame-isolated-context.test.mjs`
- Create: `tests/pending-subgame-mount.test.mjs`
- Modify: `package.json`（根）：增加 `test:subgame-context` 脚本

- [ ] **Step 1: 根 `package.json` 增加脚本**

```json
{
  "scripts": {
    "test:subgame-context": "npm run build --workspace=@ccc/fw && node --test tests/subgame-isolated-context.test.mjs tests/pending-subgame-mount.test.mjs"
  }
}
```

说明：`--workspace=@ccc/fw` 依赖 npm workspaces 已包含 `@ccc/fw` 包名（`packages/fw/package.json` 的 `name` 为 `@ccc/fw`）。

- [ ] **Step 2: 新增 `tests/subgame-isolated-context.test.mjs`（全文）**

```javascript
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
```

- [ ] **Step 3: 新增 `tests/pending-subgame-mount.test.mjs`（全文）**

```javascript
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
```

- [ ] **Step 4: 运行测试**

```bash
cd e:\bearluo\ccc-framework-monorepo
npm run test:subgame-context
```

Expected: exit code 0；每个文件 `pass` 计数 ≥ 1。

- [ ] **Step 5: Commit**

```bash
git add package.json tests/subgame-isolated-context.test.mjs tests/pending-subgame-mount.test.mjs
git commit -m "test: add subgame context isolation smoke tests"
```

---

### Task 6: Host demo 接入（最小改动演示）

**Files:**
- Modify: `apps/host/assets/demo/app-dev.ts`

- [ ] **Step 1: 修改 import 与 `onFrameworkContext` 内逻辑**

把 import 扩展为（在现有 `@ccc/fw` import 上合并为一行或多行均可）：

```typescript
import {
  type Context,
  registerDecoratedServices,
  registerTimeService,
  timeServiceToken,
  createResService,
  pickBundleBaseUrl,
  resServiceToken,
  launchParamsFromHostEnv,
  setPendingSubgameMount,
} from '@ccc/fw';
```

在 `loadBundle` 成功之后、`loadScene` 之前插入：

```typescript
const launchParams = launchParamsFromHostEnv(ctx.env);
setPendingSubgameMount({ hostContext: ctx, launchParams });
```

保持后续 `loadScene` / `runScene` 不变。

- [ ] **Step 2: Commit**

```bash
git add apps/host/assets/demo/app-dev.ts
git commit -m "feat(host): stage pending subgame mount before runScene"
```

---

### Task 7: 子游戏模板侧（最小契约脚本 + README）

**Files:**
- Create: `apps/game-template/assets/scripts/SubgameRoot.ts`（路径若不存在则创建 `assets/scripts`）
- Create: `apps/game-template/assets/scripts/README.md`

> 说明：Creator 场景里需把 `SubgameRoot` 挂到首场景根节点；该步骤在编辑器内完成，本任务用 README 记录。

- [ ] **Step 1: 新增 `SubgameRoot.ts`（全文）**

```typescript
import { _decorator, Component } from 'cc';
import {
  consumePendingSubgameMount,
  createSubgameGameContext,
  assertSubgameContextsIsolated,
  type Context,
} from '@ccc/fw';

const { ccclass } = _decorator;

@ccclass('SubgameRoot')
export class SubgameRoot extends Component {
  private _gameContext: Context | null = null;

  onLoad(): void {
    const payload = consumePendingSubgameMount();
    this._gameContext = createSubgameGameContext(payload.launchParams);
    assertSubgameContextsIsolated(payload, this._gameContext);
    void payload.hostContext;
    void this._gameContext;
  }
}
```

- [ ] **Step 2: 新增 README（全文）**

```markdown
# game-template：子游戏入口

1. 在首场景根节点添加组件 `SubgameRoot`（脚本：`assets/scripts/SubgameRoot.ts`）。
2. Host 在 `director.runScene` 前必须调用 `setPendingSubgameMount({ hostContext, launchParams })`。
3. 子游戏与 Host 交互：使用 `consumePendingSubgameMount()` 返回的 `hostContext`（示例里先保留 `void payload.hostContext`，接入业务时改为真实调用）。
```

- [ ] **Step 3: Commit**

```bash
git add apps/game-template/assets/scripts/SubgameRoot.ts apps/game-template/assets/scripts/README.md
git commit -m "feat(game-template): add SubgameRoot mount consumer"
```

---

### Task 8: `@ccc/fw` external 约定（文档，不在本计划内改 Creator 工程配置）

**Files:**
- Modify: `docs/superpowers/specs/2026-04-23-cross-project-bundle-context-design.md` 不需要改；新增 `docs/superpowers/notes/2026-04-23-subgame-fw-external.md`

- [ ] **Step 1: 新增 notes 文档（全文）**

```markdown
# 子游戏 remote bundle：@ccc/fw external 约定（实现清单）

目标：子游戏 bundle 内不出现第二份 `@ccc/fw` 运行时实现。

建议路径（按团队工具链二选一）：

1. Creator 自定义构建模板 / bundler external 列表中加入 `@ccc/fw`
2. 子游戏工程通过 import map（Web）或等价机制解析到 Host 已加载模块（需与目标平台一致）

验收：对子游戏 remote bundle 产物做字符串检索，不应包含重复打包的 `fw` 特征路径（按你们 CI 策略定义）。
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/notes/2026-04-23-subgame-fw-external.md
git commit -m "docs: note subgame @ccc/fw external build expectations"
```

---

## Self-review（对照 `docs/superpowers/specs/2026-04-23-cross-project-bundle-context-design.md`）

**1. Spec coverage**

| Spec 段落 | Task |
|-----------|------|
| 双 `Context` + 三隔离 | Task 2 + Task 5 |
| Host 传 `hostContext` + `launchParams` | Task 1、3、6 |
| `runScene` 前交付 | Task 3 + 6（pending）+ Task 7（consume） |
| 子游戏入口契约 | Task 7 |
| 强共享 fw | Task 8（文档化 external；真正改构建在后续迭代） |
| 反模式：不共享引用 | Task 2 `assertSubgameContextsIsolated` + Task 5 |

**2. Placeholder scan**

无 `TBD`；`launchParamsFromHostEnv` 当前只拷贝 `mode/platform`（**不传 `flags`**），与 **YAGNI** 一致；需要 flags 快照时在独立任务中扩展 `launchParams` 结构或由 Host 直接传入完整 `CreateEnvOptions`。

**3. Type consistency**

- 统一使用规格中的方法名 **`onSubgameMount`** 作为概念名；本计划 `SubgameRoot` 用 `onLoad` 承载消费逻辑（等价入口），不在 API 层引入第三个名字。

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-23-cross-project-bundle-context.md`. Two execution options:**

**1. Subagent-Driven（推荐）** — 每个 Task 派生子代理执行，Task 之间你快速 review。  
**2. Inline Execution** — 在本会话按 Task 顺序执行，并在关键 Task 后设检查点。

**Which approach?**
