# res 模块（Bundle 主轴）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `@fw/res` 从「`assetManager.loadAny` 会话」迁移为 **`assetManager.loadBundle` → `ResBundleSession` → `bundle.load` / `bundle.preload`** 的推荐路径；`dispose` 仍按次 `assetManager.releaseAsset`；移除旧的 `ResScope` / `openScope` 公共面。

**Architecture:** `ResServiceImpl` 持有 `AssetManager`，提供 `getBundle` 与 **Promise 化**的 `loadBundle`；`loadBundle` resolve 后返回 `ResBundleSessionImpl`，其内部持有 `bundle` + `assetManager` 引用以便 `releaseAsset`。`ResBundleSessionImpl` 用与现 `ResScopeImpl` 相同的 **Map&lt;Asset, number&gt;** 记账与 **closed + 晚到 resolve** 策略；`Bundle.load` / `Bundle.preload` 在实现层按 Creator 3.8.8 回调式 API **Promise 化**（与当前 `promisifyLoadAny` 模式一致）。删除 `res-scope.ts` 与 `ResScope*` 类型；`bundles.ts` 占位接口由 `ResService` 方法覆盖后 **删除**。

**Tech Stack:** TypeScript、Cocos Creator 3.8.8（`AssetManager` / `Bundle` / `Asset`）、Vitest、`tsconfig.eslint.json` 类型解析。

**Spec 来源:** `docs/superpowers/specs/2026-04-18-res-bundle-centric-design.md`

---

## 文件结构（落地前锁定）

| 文件 | 动作 | 职责 |
|------|------|------|
| `assets/framework/res/res-types.ts` | 修改 | 定义 `ResService`（`getBundle`、`loadBundle`，**无** `openScope`）、`ResBundleSession`（`bundle`、`load`、`preload`、`dispose`） |
| `assets/framework/res/res-bundle-session.ts` | 新建 | `ResBundleSessionImpl`：记账、`dispose`、Promise 化 `bundle.load` / `bundle.preload` |
| `assets/framework/res/res-service.ts` | 修改 | `loadBundle` / `getBundle`；`openScope` 删除；`createResService` 不变 |
| `assets/framework/res/res-scope.ts` | 删除 | 旧 `ResScopeImpl` |
| `assets/framework/res/bundles.ts` | 删除 | `ResBundlesGateway` 已由 `ResService` 覆盖 |
| `assets/framework/res/index.ts` | 修改 | 导出 `ResBundleSession`、`ResBundleSessionImpl`；移除 `ResScope` / `ResScopeImpl` |
| `tests/res.asset-manager.test.ts` | 删除或整体替换 | 改为 bundle 会话测试（建议重命名为 `tests/res.bundle-session.test.ts`） |
| `docs/architecture/ccc-framework.md` | 修改 | `res/*` 小节改为 bundle 主轴描述 |
| `docs/superpowers/plans/2026-04-18-res-assetmanager.md` | 修改 | 文首增加「已由 bundle 主轴计划取代」指针（保留历史任务文本） |

---

### Task 1: 更新类型定义 `res-types.ts`

**Files:**
- Modify: `assets/framework/res/res-types.ts`

- [ ] **Step 1: 将文件整体替换为**

```ts
import type { Asset, AssetManager, Bundle } from 'cc';

export interface ResBundleSession {
    readonly bundle: Bundle;
    load<T extends Asset>(...args: Parameters<Bundle['load']>): Promise<T>;
    preload(...args: Parameters<Bundle['preload']>): Promise<void>;
    dispose(): void;
}

export interface ResService {
    readonly assetManager: AssetManager;
    getBundle(name: string): Bundle | null;
    loadBundle(nameOrUrl: string, options?: unknown): Promise<ResBundleSession>;
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/framework/res/res-types.ts
git commit -m "refactor(res): 类型改为 ResService + ResBundleSession"
```

---

### Task 2: 实现 `ResBundleSessionImpl`

**Files:**
- Create: `assets/framework/res/res-bundle-session.ts`

- [ ] **Step 1: 写入实现（与 `ResScopeImpl` 同策略：closed、Map 计数、dispose 抛合并 Error、晚到 resolve 补一次 releaseAsset）**

```ts
import type { Asset, AssetManager, Bundle } from 'cc';
import type { ResBundleSession } from './res-types';

function promisifyBundleLoad(bundle: Bundle, args: Parameters<Bundle['load']>): Promise<Asset> {
    return new Promise((resolve, reject) => {
        const onComplete = (err: Error | null, data: unknown) => {
            if (err) reject(err);
            else resolve(data as Asset);
        };
        (bundle as unknown as { load(...a: unknown[]): void }).load(...args, onComplete);
    });
}

function promisifyBundlePreload(bundle: Bundle, args: Parameters<Bundle['preload']>): Promise<void> {
    return new Promise((resolve, reject) => {
        const onComplete = (err: Error | null, _data: unknown) => {
            if (err) reject(err);
            else resolve();
        };
        (bundle as unknown as { preload(...a: unknown[]): void }).preload(...args, onComplete);
    });
}

export class ResBundleSessionImpl implements ResBundleSession {
    private readonly acquires = new Map<Asset, number>();
    private closed = false;

    constructor(
        private readonly am: AssetManager,
        public readonly bundle: Bundle,
    ) {}

    async load<T extends Asset>(...args: Parameters<Bundle['load']>): Promise<T> {
        if (this.closed) throw new Error('ResBundleSession disposed');
        const asset = (await promisifyBundleLoad(this.bundle, args)) as T;
        if (this.closed) {
            this.am.releaseAsset(asset);
            return asset;
        }
        this.acquires.set(asset, (this.acquires.get(asset) ?? 0) + 1);
        return asset;
    }

    async preload(...args: Parameters<Bundle['preload']>): Promise<void> {
        if (this.closed) throw new Error('ResBundleSession disposed');
        await promisifyBundlePreload(this.bundle, args);
    }

    dispose(): void {
        if (this.closed) return;
        this.closed = true;

        const errors: Error[] = [];
        for (const [asset, count] of [...this.acquires.entries()]) {
            for (let i = 0; i < count; i++) {
                try {
                    this.am.releaseAsset(asset);
                } catch (e) {
                    errors.push(e instanceof Error ? e : new Error(String(e)));
                }
            }
        }
        this.acquires.clear();

        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) {
            const msg = errors.map((e, i) => `[${i}] ${e.message}`).join('; ');
            throw new Error(`ResBundleSession.dispose: releaseAsset failed (${errors.length}): ${msg}`);
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/framework/res/res-bundle-session.ts
git commit -m "feat(res): 实现 ResBundleSession 记账与 dispose"
```

---

### Task 3: 更新 `ResServiceImpl`（loadBundle / getBundle，移除 openScope）

**Files:**
- Modify: `assets/framework/res/res-service.ts`

- [ ] **Step 1: 将文件替换为**

```ts
import { assetManager } from 'cc';
import type { AssetManager, Bundle } from 'cc';
import type { ResBundleSession, ResService } from './res-types';
import { ResBundleSessionImpl } from './res-bundle-session';

function promisifyLoadBundle(am: AssetManager, nameOrUrl: string, options?: unknown): Promise<Bundle> {
    return new Promise((resolve, reject) => {
        const onComplete = (err: Error | null, bundle: unknown) => {
            if (err) reject(err);
            else resolve(bundle as Bundle);
        };
        if (options === undefined) {
            (am as unknown as { loadBundle(name: string, onComplete: (e: Error | null, b: unknown) => void): void }).loadBundle(
                nameOrUrl,
                onComplete,
            );
        } else {
            (
                am as unknown as {
                    loadBundle(name: string, options: unknown, onComplete: (e: Error | null, b: unknown) => void): void;
                }
            ).loadBundle(nameOrUrl, options, onComplete);
        }
    });
}

export class ResServiceImpl implements ResService {
    constructor(public readonly assetManager: AssetManager) {}

    getBundle(name: string): Bundle | null {
        return this.assetManager.getBundle(name);
    }

    async loadBundle(nameOrUrl: string, options?: unknown): Promise<ResBundleSession> {
        const bundle = await promisifyLoadBundle(this.assetManager, nameOrUrl, options);
        return new ResBundleSessionImpl(this.assetManager, bundle);
    }
}

export function createResService(am?: AssetManager): ResService {
    return new ResServiceImpl(am ?? assetManager);
}
```

> 若本地引擎 `loadBundle` 重载与上述分支不一致，以实现阶段 `tsc`/IDE 为准微调 `promisifyLoadBundle` 分支，但 **对外** 必须保持 `loadBundle(nameOrUrl, options?)`。

- [ ] **Step 2: Commit**

```bash
git add assets/framework/res/res-service.ts
git commit -m "feat(res): ResService 增加 loadBundle/getBundle 并移除 openScope"
```

---

### Task 4: 删除旧文件并更新 barrel

**Files:**
- Delete: `assets/framework/res/res-scope.ts`
- Delete: `assets/framework/res/bundles.ts`
- Modify: `assets/framework/res/index.ts`

- [ ] **Step 1: `index.ts` 替换为**

```ts
export type { ResService, ResBundleSession } from './res-types';
export { createResService, ResServiceImpl } from './res-service';
export { ResBundleSessionImpl } from './res-bundle-session';
```

- [ ] **Step 2: 删除 `res-scope.ts`、`bundles.ts`**

- [ ] **Step 3: Commit**

```bash
git add assets/framework/res/index.ts
git rm assets/framework/res/res-scope.ts assets/framework/res/bundles.ts
git commit -m "refactor(res): 移除 ResScope 与 bundles 占位，导出 Bundle 会话"
```

---

### Task 5: 重写 Vitest

**Files:**
- Delete: `tests/res.asset-manager.test.ts`
- Create: `tests/res.bundle-session.test.ts`

- [ ] **Step 1: 写入新测试（`vi.mock('cc')` 提供最小 `assetManager`；注入 fake `AssetManager` 覆盖 `loadBundle/getBundle/releaseAsset`；fake `Bundle` 的 `load/preload` 使用最后一参 `onComplete`）**

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('cc', () => ({
    assetManager: {
        loadBundle: vi.fn(),
        getBundle: vi.fn(),
        releaseAsset: vi.fn(),
    },
}));

import type { Asset, AssetManager, Bundle } from 'cc';
import { createResService } from '../assets/framework/res/res-service';
import { ResBundleSessionImpl } from '../assets/framework/res/res-bundle-session';

function createFakeAsset(name: string): Asset {
    return { name } as unknown as Asset;
}

type OnComplete = (err: Error | null, data: unknown) => void;

function peelOnComplete(args: unknown[]): { onComplete: OnComplete } {
    return { onComplete: args[args.length - 1] as OnComplete };
}

function createFakeBundle(sharedAsset: Asset) {
    const load = vi.fn((...args: unknown[]) => {
        const { onComplete } = peelOnComplete(args);
        queueMicrotask(() => onComplete(null, sharedAsset));
    });
    const preload = vi.fn((...args: unknown[]) => {
        const { onComplete } = peelOnComplete(args);
        queueMicrotask(() => onComplete(null, undefined));
    });
    return { load, preload, bundle: { load, preload } as unknown as Bundle };
}

function createDeps() {
    const releaseAsset = vi.fn((_a: Asset) => {});
    const shared = createFakeAsset('A');
    const { load, preload, bundle } = createFakeBundle(shared);

    const loadBundle = vi.fn((_name: string, onComplete: OnComplete) => {
        queueMicrotask(() => onComplete(null, bundle));
    });

    const am = {
        loadBundle,
        getBundle: vi.fn(() => null),
        releaseAsset,
    } as unknown as AssetManager;

    return { am, loadBundle, load, preload, releaseAsset, shared };
}

describe('res / bundle session', () => {
    it('同 asset 两次 load：dispose 后 releaseAsset 两次；再次 dispose 幂等', async () => {
        const { am, releaseAsset, load } = createDeps();
        const svc = createResService(am);
        const session = await svc.loadBundle('main');

        const a1 = await session.load('p' as never);
        const a2 = await session.load('p' as never);
        expect(load).toHaveBeenCalled();
        expect(a1).toBe(a2);

        session.dispose();
        expect(releaseAsset).toHaveBeenCalledTimes(2);

        session.dispose();
        expect(releaseAsset).toHaveBeenCalledTimes(2);
    });

    it('preload 不计入 dispose 的 releaseAsset', async () => {
        const { am, releaseAsset, preload } = createDeps();
        const session = await createResService(am).loadBundle('main');
        await session.preload('x' as never);
        session.dispose();
        expect(preload).toHaveBeenCalled();
        expect(releaseAsset).toHaveBeenCalledTimes(0);
    });

    it('dispose 后 load 应 reject', async () => {
        const { am } = createDeps();
        const session = await createResService(am).loadBundle('main');
        session.dispose();
        await expect(session.load('x' as never)).rejects.toThrow(/disposed/);
    });

    it('竞态：先 dispose 再 load resolve → releaseAsset 一次', async () => {
        const { am, releaseAsset } = createDeps();
        const shared = createFakeAsset('A');
        let finish: OnComplete | null = null;
        const bundle = {
            load: vi.fn((...args: unknown[]) => {
                finish = peelOnComplete(args).onComplete;
            }),
            preload: vi.fn(),
        } as unknown as Bundle;

        const loadBundle = vi.fn((_n: string, oc: OnComplete) => {
            queueMicrotask(() => oc(null, bundle));
        });
        const fam = { loadBundle, getBundle: vi.fn(), releaseAsset } as unknown as AssetManager;

        const session = new ResBundleSessionImpl(fam, bundle);
        const pending = session.load('x' as never);
        session.dispose();
        finish!(null, shared);
        const asset = await pending;
        expect(asset).toBe(shared);
        expect(releaseAsset).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: 运行**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/res.bundle-session.test.ts
git rm tests/res.asset-manager.test.ts
git commit -m "test(res): 改为覆盖 ResBundleSession 行为"
```

---

### Task 6: 更新架构文档

**Files:**
- Modify: `docs/architecture/ccc-framework.md`

- [ ] **Step 1:** 将 `### \`res\`` 小节改为描述 `getBundle` / `loadBundle` / `ResBundleSession.load` / `preload` / `dispose`；删除对 `openScope`、`loadAny`、`ResBundlesGateway` 文件占位、`legacy` 的表述（若仍有残留一并清理）。

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/ccc-framework.md
git commit -m "docs(architecture): res 模块改为 Bundle 主轴描述"
```

---

### Task 7: 旧 implementation plan 加指针

**Files:**
- Modify: `docs/superpowers/plans/2026-04-18-res-assetmanager.md`

- [ ] **Step 1:** 在标题下增加说明块：`本计划描述的旧 ResScope/loadAny 路径已被 docs/superpowers/plans/2026-04-18-res-bundle-centric.md 取代；新实现请按新计划执行。`

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-04-18-res-assetmanager.md
git commit -m "docs(plan): 标明 res assetManager 计划已由 bundle 计划取代"
```

---

## Self-review（对照 `2026-04-18-res-bundle-centric-design.md`）

| Spec 条款 | Task |
|-----------|------|
| `getBundle` / `loadBundle` | Task 3 |
| `ResBundleSession` + `load`/`preload`/`dispose` | Task 1–2 |
| `releaseAsset` 按次、不用 AggregateError | Task 2 |
| `preload` 不记账 | Task 2、5 |
| 晚到 resolve + closed | Task 2、5 |
| 移除 `openScope` / `ResScope` | Task 4 |
| 不默认 removeBundle | Task 2（无调用） |
| Vitest | Task 5 |
| 架构文档 | Task 6 |

---

## Plan complete

Plan complete and saved to `docs/superpowers/plans/2026-04-18-res-bundle-centric.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每 Task 派生子代理，Task 间复核  
**2. Inline Execution** — 本会话按 Task 顺序直接改代码并跑测试

回复 **`1`** 或 **`2`** 即开始落地实现。
