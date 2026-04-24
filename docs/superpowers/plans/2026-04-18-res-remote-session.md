# ResRemoteSession（loadRemote 会话）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `res` 模块实现 `ResService.openRemoteSession()` 与 `ResRemoteSession`（Promise 化 `assetManager.loadRemote`、按次 acquire、`dispose` 按次 `decRef`、晚到 resolve 与 bundle 会话一致），并补充 Vitest 与架构文档。

**Architecture:** 新增 `ResRemoteSessionImpl`（内部持有注入的 `AssetManager`），`load` 将参数转发给引擎 `loadRemote` 并在末尾挂内部回调；记账与 `ResBundleSessionImpl` 同结构（`Map<Asset, number>` + `closed`）。`ResServiceImpl.openRemoteSession` 同步返回会话。不引入超时/重试/cache（见 spec 非目标）。

**Tech Stack:** TypeScript、Cocos Creator 3.8.8 类型（`cc` 的 `Asset` / `AssetManager`）、Vitest 4.x、仓库脚本 `npm test` / `npm run typecheck` / `npm run lint`。

**Spec 来源:** `docs/superpowers/specs/2026-04-18-res-remote-session-design.md`

---

## 文件结构（将创建 / 修改）

| 文件 | 职责 |
|------|------|
| `assets/framework/res/res-types.ts` | 声明 `ResRemoteLoadArgs`、`ResRemoteSession`；`ResService` 增加 `openRemoteSession` |
| `assets/framework/res/res-remote-session.ts` | `ResRemoteSessionImpl`：Promise 化 `loadRemote`、acquire、`dispose`、`closed`/晚到 |
| `assets/framework/res/res-service.ts` | `ResServiceImpl.openRemoteSession()` |
| `assets/framework/res/index.ts` | 导出 `ResRemoteSession`、`ResRemoteSessionImpl`（与 `ResBundleSessionImpl` 并列） |
| `tests/res.remote-session.test.ts` | Fake `AssetManager.loadRemote`、与 bundle 测试对称的用例 |
| `docs/architecture/ccc-framework.md` | 「能力层 res」小节增加 `openRemoteSession` / `ResRemoteSession` 一行说明 + spec 链接 |

---

### Task 1: `ResRemoteLoadArgs` 与 `ResRemoteSession` 类型、`ResService` 方法签名

**Files:**

- Modify: `assets/framework/res/res-types.ts`

- [ ] **Step 1: 在 `res-types.ts` 增加类型与接口（保持与 `ResBundle` 相同的 `import type` 风格）**

在 `AssetManager` 导入与 `ResBundle` 声明之后插入 `ResRemoteLoadArgs`（见下：若本地 `cc` 无 `loadRemote` 声明，**不用** `Parameters<AssetManager['loadRemote']>`，避免推断为 `never`）；新增 `ResRemoteSession`；在 `ResService` 中增加 `openRemoteSession(): ResRemoteSession`。

```typescript
import type { Asset, AssetManager } from 'cc';

/** Creator 3.8：`Bundle` 位于 `AssetManager` 命名空间下。 */
export type ResBundle = AssetManager.Bundle;

/**
 * `loadRemote` 去掉末尾 `onComplete` 后的参数表；首参为 URL。
 * 本地 `cc` 声明若缺 `loadRemote`，采用该元组以保证可编译（与 spec §4.2 一致）。
 */
export type ResRemoteLoadArgs = [url: string, ...params: unknown[]];

export interface ResBundleSession {
    readonly bundle: ResBundle;
    load<T extends Asset>(...args: ResBundleLoadArgs<T>): Promise<T>;
    preload(...args: ResBundlePreloadArgs): Promise<void>;
    dispose(): void;
}

export interface ResRemoteSession {
    load<T extends Asset>(...args: ResRemoteLoadArgs): Promise<T>;
    dispose(): void;
}

export interface ResService {
    readonly assetManager: AssetManager;
    getBundle(name: string): ResBundle | null;
    loadBundle(nameOrUrl: string, options?: unknown): Promise<ResBundleSession>;
    openRemoteSession(): ResRemoteSession;
}
```

- [ ] **Step 2: 提交（仅类型，可先不提交留到 Task 5 一并提交；若分步提交则用中文 message）**

```bash
git add assets/framework/res/res-types.ts
git commit -m "feat(res): 增加 ResRemoteSession 与 openRemoteSession 类型"
```

---

### Task 2: 失败测试 — `tests/res.remote-session.test.ts`

**Files:**

- Create: `tests/res.remote-session.test.ts`

- [ ] **Step 1: 新建测试文件（完整内容如下；实现尚未存在时期望 `npm test` 失败：找不到 `ResRemoteSessionImpl` 或 `openRemoteSession`）**

```typescript
import { describe, expect, it, vi } from 'vitest';

vi.mock('cc', () => ({
    assetManager: {
        loadBundle: vi.fn(),
        getBundle: vi.fn(),
    },
}));

import type { Asset, AssetManager } from 'cc';
import { createResService } from '../assets/framework/res/res-service';
import { ResRemoteSessionImpl } from '../assets/framework/res/res-remote-session';

function createFakeAsset(name: string): Asset {
    return {
        name,
        decRef: vi.fn(),
    } as unknown as Asset;
}

type OnComplete = (err: Error | null, data: unknown) => void;

function peelOnComplete(args: unknown[]): { onComplete: OnComplete } {
    return { onComplete: args[args.length - 1] as OnComplete };
}

function createDeps() {
    const shared = createFakeAsset('remote-a');

    const loadRemote = vi.fn((...args: unknown[]) => {
        const { onComplete } = peelOnComplete(args);
        queueMicrotask(() => onComplete(null, shared));
    });

    const am = {
        loadRemote,
        loadBundle: vi.fn(),
        getBundle: vi.fn(() => null),
    } as unknown as AssetManager;

    return { am, loadRemote, shared };
}

describe('res / remote session', () => {
    it('openRemoteSession：同 asset 两次 load，dispose 后 decRef 两次；再次 dispose 幂等', async () => {
        const { am, shared, loadRemote } = createDeps();
        const svc = createResService(am);
        const session = svc.openRemoteSession();

        const u1 = await session.load('https://example.com/a.png' as never);
        const u2 = await session.load('https://example.com/a.png' as never);
        expect(loadRemote).toHaveBeenCalled();
        expect(u1).toBe(u2);

        session.dispose();
        expect(shared.decRef).toHaveBeenCalledTimes(2);

        session.dispose();
        expect(shared.decRef).toHaveBeenCalledTimes(2);
    });

    it('load 失败：不记账，dispose 不 decRef', async () => {
        const shared = createFakeAsset('x');
        const loadRemote = vi.fn((...args: unknown[]) => {
            const { onComplete } = peelOnComplete(args);
            queueMicrotask(() => onComplete(new Error('network'), null));
        });
        const am = { loadRemote, loadBundle: vi.fn(), getBundle: vi.fn() } as unknown as AssetManager;
        const session = createResService(am).openRemoteSession();

        await expect(session.load('https://bad' as never)).rejects.toThrow(/network/);
        session.dispose();
        expect(shared.decRef).toHaveBeenCalledTimes(0);
    });

    it('dispose 后 load 应 reject', async () => {
        const { am } = createDeps();
        const session = createResService(am).openRemoteSession();
        session.dispose();
        await expect(session.load('https://x' as never)).rejects.toThrow(/disposed/i);
    });

    it('竞态：先 dispose 再 loadRemote 完成 → decRef 一次且仍 resolve', async () => {
        const shared = createFakeAsset('late');
        let finish: OnComplete | null = null;
        const loadRemote = vi.fn((...args: unknown[]) => {
            finish = peelOnComplete(args).onComplete;
        });
        const am = { loadRemote, loadBundle: vi.fn(), getBundle: vi.fn() } as unknown as AssetManager;

        const session = new ResRemoteSessionImpl(am);
        const pending = session.load('https://late' as never);
        session.dispose();
        finish!(null, shared);
        const asset = await pending;
        expect(asset).toBe(shared);
        expect(shared.decRef).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/res.remote-session.test.ts`

Expected: FAIL（例如 `ResRemoteSessionImpl` 未导出 / `openRemoteSession` 不存在）

---

### Task 3: `ResRemoteSessionImpl` 实现

**Files:**

- Create: `assets/framework/res/res-remote-session.ts`

- [ ] **Step 1: 写入实现（与 `res-bundle-session.ts` 对齐注释与行为）**

```typescript
import type { Asset, AssetManager } from 'cc';
import type { ResRemoteLoadArgs, ResRemoteSession } from './res-types';

function promisifyLoadRemote(am: AssetManager, args: ResRemoteLoadArgs): Promise<Asset> {
    return new Promise((resolve, reject) => {
        const onComplete = (err: Error | null, data: unknown) => {
            if (err) reject(err);
            else resolve(data as Asset);
        };
        (am as unknown as { loadRemote(...a: unknown[]): void }).loadRemote(...args, onComplete);
    });
}

/**
 * 与官方引用计数模型对齐：`loadRemote` 成功返回的资源在会话结束时按次 `decRef()`，
 * 不默认使用 `assetManager.releaseAsset()`。
 */
export class ResRemoteSessionImpl implements ResRemoteSession {
    private readonly acquires = new Map<Asset, number>();
    private closed = false;

    constructor(private readonly am: AssetManager) {}

    async load<T extends Asset>(...args: ResRemoteLoadArgs): Promise<T> {
        if (this.closed) {
            throw new Error('ResRemoteSession disposed');
        }
        const asset = (await promisifyLoadRemote(this.am, args)) as T;
        if (this.closed) {
            asset.decRef();
            return asset;
        }
        this.acquires.set(asset, (this.acquires.get(asset) ?? 0) + 1);
        return asset;
    }

    dispose(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;

        const errors: Error[] = [];
        for (const [asset, count] of [...this.acquires.entries()]) {
            for (let i = 0; i < count; i++) {
                try {
                    asset.decRef();
                } catch (e) {
                    errors.push(e instanceof Error ? e : new Error(String(e)));
                }
            }
        }
        this.acquires.clear();

        if (errors.length === 1) {
            throw errors[0];
        }
        if (errors.length > 1) {
            const msg = errors.map((e, i) => `[${i}] ${e.message}`).join('; ');
            throw new Error(`ResRemoteSession.dispose: decRef failed (${errors.length}): ${msg}`);
        }
    }
}
```

- [ ] **Step 2: 若 `npm run typecheck` 报 `loadRemote` 展开参数错误**

若未来仓库补齐带 `loadRemote` 的 `cc` 声明，可将 `ResRemoteLoadArgs` 收紧为 `DropLast<Parameters<AssetManager['loadRemote']>>`（并跑通 `npm run typecheck`）。

Run: `npm run typecheck`

Expected: PASS（或按上一步修正后 PASS）

---

### Task 4: `ResServiceImpl.openRemoteSession` 与 barrel 导出

**Files:**

- Modify: `assets/framework/res/res-service.ts`
- Modify: `assets/framework/res/index.ts`

- [ ] **Step 1: 在 `res-service.ts` 增加 import 与方法**

文件头部增加：

```typescript
import type { ResRemoteSession } from './res-types';
import { ResRemoteSessionImpl } from './res-remote-session';
```

在 `ResServiceImpl` 类中 `loadBundle` 方法之后增加：

```typescript
    openRemoteSession(): ResRemoteSession {
        return new ResRemoteSessionImpl(this.assetManager);
    }
```

- [ ] **Step 2: 更新 `index.ts`**

将第一行改为同时导出远程类型与实现类，例如：

```typescript
export type { ResService, ResBundleSession, ResBundle, ResRemoteSession, ResRemoteLoadArgs } from './res-types';
export { createResService, ResServiceImpl } from './res-service';
export { ResBundleSessionImpl } from './res-bundle-session';
export { ResRemoteSessionImpl } from './res-remote-session';
```

- [ ] **Step 3: 运行测试**

Run: `npm test -- tests/res.remote-session.test.ts`

Expected: PASS

Run: `npm test`

Expected: 全部 PASS（含既有 `res.bundle-session.test.ts`）

---

### Task 5: 架构文档 `res` 小节

**Files:**

- Modify: `docs/architecture/ccc-framework.md`（约 L186–194 `### res` 列表内）

- [ ] **Step 1: 在 `ResBundleSession` 条目之后增加一条（或合并为一段）**

新增要点（可压缩为 1–2 行）：

- `ResService.openRemoteSession()`：同步返回 `ResRemoteSession`。
- `ResRemoteSession`（`ResRemoteSessionImpl`）：`load` Promise 化 `assetManager.loadRemote`；成功结果按次记账，`dispose` 按次 `decRef`；晚到 resolve / `addRef` 约定与 `ResBundleSession` 一致；spec：`docs/superpowers/specs/2026-04-18-res-remote-session-design.md`。

- [ ] **Step 2: 无需单独测试；`npm run lint` 可选**

Run: `npm run lint`

Expected: PASS

---

### Task 6: 全量校验与提交

- [ ] **Step 1: 全量命令**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: 均 PASS

- [ ] **Step 2: 提交（中文说明；按已暂存文件调整路径）**

```bash
git add assets/framework/res/res-types.ts assets/framework/res/res-remote-session.ts assets/framework/res/res-service.ts assets/framework/res/index.ts tests/res.remote-session.test.ts docs/architecture/ccc-framework.md
git commit -m "feat(res): 实现 ResRemoteSession（loadRemote 会话与 decRef）" -m "- ResService.openRemoteSession 同步返回会话`n- 与 ResBundleSession 对齐 acquire/dispose/晚到规则`n- Vitest + 架构文档"
```

---

## Plan 自检（对照 spec）

| Spec 章节 | 对应任务 |
|-----------|----------|
| §2.1 `openRemoteSession` 同步 | Task 4 |
| §2.1 `load` / `dispose` / 晚到 / decRef 错误聚合 | Task 3 |
| §2.2 非目标（无超时等） | 不实现 — 无任务 |
| §3 依赖边界 | 仅改 `res/*`、测试、架构文档 — 满足 |
| §4 公共 API | Task 1 + 3 + 4 |
| §7 测试用例 | Task 2 |
| 架构 barrel | Task 4 + 5 |

**Placeholder 扫描:** 本 plan 无 TBD /「适当处理」类步骤。

**类型一致性:** `ResRemoteSession.load` 与 `ResRemoteSessionImpl.load` 均使用 `ResRemoteLoadArgs`（当前为 `[url: string, ...params: unknown[]]`）；`openRemoteSession` 返回 `ResRemoteSession`。

---

## Execution Handoff

**Plan 已保存至 `docs/superpowers/plans/2026-04-18-res-remote-session.md`。执行方式二选一：**

1. **Subagent-Driven（推荐）** — 每个 Task 派生子代理并在 Task 间复核；适合并行度低、需频繁对照 spec 的改动。  
2. **Inline Execution** — 本会话按 Task 顺序执行，配合 `executing-plans` 的批次与检查点。

**请选择 1 或 2。**
