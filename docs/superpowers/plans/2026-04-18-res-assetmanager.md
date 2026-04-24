# res 模块（对接 `assetManager`）Implementation Plan

> **已由新计划取代**：以 Bundle 会话为主轴的实现与任务请见 `docs/superpowers/plans/2026-04-18-res-bundle-centric.md`。下文保留作历史参考。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `@fw/res` 落地 `createResService` + `ResScope`，默认对接 `cc.assetManager`，实现 `loadAny` 成功路径的按次记账与 `dispose()` 配对 `releaseAsset`；`preload` 不纳入自动释放；并提供可注入 `AssetManager` 的 Vitest 单测。

**Architecture:** `ResService` 持有 `AssetManager`（默认全局 `assetManager`），仅负责创建 `ResScope`。`ResScope` 将 `loadAny/preload` 委托给 `assetManager`，并在 `loadAny` resolve 后按 `Asset` 实例累计 acquire 次数；`dispose()` 幂等并按次数调用 `releaseAsset`。若 `loadAny` 在 scope 已 `dispose` 后才 resolve，则立刻 `releaseAsset` 一次，避免引擎侧引用泄漏。扩展点 `ResBundlesGateway` 仅占位类型文件，无实现。

**Tech Stack:** TypeScript、Cocos Creator 3.8.8（`assetManager.loadAny/preload/releaseAsset`）、Vitest、仓库别名 `@fw/*`。

**Spec 来源:** `docs/superpowers/specs/2026-04-18-res-assetmanager-design.md`

---

## 文件结构（落地前锁定）

| 文件 | 职责 |
|------|------|
| `assets/framework/res/res-types.ts` | `ResService` / `ResScope` 的 public 接口（`import type { Asset, AssetManager } from 'cc'`） |
| `assets/framework/res/res-scope.ts` | `ResScope` 实现类（记账、`dispose`、closed 语义） |
| `assets/framework/res/res-service.ts` | `ResService` 实现类 + `createResService()` |
| `assets/framework/res/bundles.ts` | `ResBundlesGateway` 占位接口（无实现） |
| `assets/framework/res/index.ts` | barrel：导出上述 API；保留 `ResKey`；`ResLoader` 标记 `@deprecated` 指向新 API |
| `tests/res.asset-manager.test.ts` | Vitest：fake `AssetManager` 验证 acquire/release/preload/dispose/竞态 |
| `docs/architecture/ccc-framework.md` | 更新 `res/*`「现状」最小 public API 描述，与代码一致 |

---

### Task 1: 定义 public 接口与 Bundle 占位类型

**Files:**
- Create: `assets/framework/res/res-types.ts`
- Create: `assets/framework/res/bundles.ts`

- [ ] **Step 1: 写入 `res-types.ts`**

```ts
import type { Asset, AssetManager } from 'cc';

export interface ResScope {
    loadAny<T extends Asset>(...args: Parameters<AssetManager['loadAny']>): Promise<T>;
    preload(...args: Parameters<AssetManager['preload']>): Promise<void>;
    dispose(): void;
}

export interface ResService {
    readonly assetManager: AssetManager;
    openScope(): ResScope;
}
```

- [ ] **Step 2: 写入 `bundles.ts`（仅占位，不实现）**

```ts
import type { AssetManager, Bundle } from 'cc';

/**
 * Bundle / Remote 扩展点（非 MVP）。实现留待后续里程碑。
 */
export interface ResBundlesGateway {
    loadBundle(nameOrUrl: string, options?: unknown): Promise<Bundle>;
    getBundle(name: string): Bundle | null;
}
```

- [ ] **Step 3: Commit**

```bash
git add assets/framework/res/res-types.ts assets/framework/res/bundles.ts
git commit -m "feat(res): 增加 ResService/ResScope 类型与 Bundle 扩展点占位"
```

---

### Task 2: 实现 `ResScope`（记账 + dispose + closed 语义）

**Files:**
- Create: `assets/framework/res/res-scope.ts`

- [ ] **Step 1: 写入完整实现**

```ts
import type { Asset, AssetManager } from 'cc';
import type { ResScope } from './res-types';

export class ResScopeImpl implements ResScope {
    private readonly acquires = new Map<Asset, number>();
    private closed = false;

    constructor(private readonly am: AssetManager) {}

    async loadAny<T extends Asset>(...args: Parameters<AssetManager['loadAny']>): Promise<T> {
        if (this.closed) {
            throw new Error('ResScope disposed');
        }
        const asset = (await this.am.loadAny(...(args as never))) as T;
        if (this.closed) {
            // dispose 已发生：不再纳入记账，但必须配对引擎侧本次 load 的引用
            this.am.releaseAsset(asset);
            return asset;
        }
        this.acquires.set(asset, (this.acquires.get(asset) ?? 0) + 1);
        return asset;
    }

    async preload(...args: Parameters<AssetManager['preload']>): Promise<void> {
        if (this.closed) {
            throw new Error('ResScope disposed');
        }
        await this.am.preload(...(args as never));
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
                    this.am.releaseAsset(asset);
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
            throw new AggregateError(errors, 'ResScope.dispose: releaseAsset failed');
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/framework/res/res-scope.ts
git commit -m "feat(res): 实现 ResScope 记账与 dispose 释放"
```

---

### Task 3: 实现 `createResService` + `ResServiceImpl`

**Files:**
- Create: `assets/framework/res/res-service.ts`

- [ ] **Step 1: 写入 `res-service.ts`**

```ts
import { assetManager } from 'cc';
import type { AssetManager } from 'cc';
import type { ResScope, ResService } from './res-types';
import { ResScopeImpl } from './res-scope';

export class ResServiceImpl implements ResService {
    constructor(public readonly assetManager: AssetManager) {}

    openScope(): ResScope {
        return new ResScopeImpl(this.assetManager);
    }
}

export function createResService(am?: AssetManager): ResService {
    return new ResServiceImpl(am ?? assetManager);
}
```

- [ ] **Step 2: Commit**

```bash
git add assets/framework/res/res-service.ts
git commit -m "feat(res): 增加 createResService 与 ResServiceImpl"
```

---

### Task 4: 更新 barrel `assets/framework/res/index.ts`

**Files:**
- Create: `assets/framework/res/legacy.ts`
- Modify: `assets/framework/res/index.ts`

- [ ] **Step 1: 新增 `assets/framework/res/legacy.ts`**

```ts
/**
 * @deprecated 使用 `createResService` + `ResScope.loadAny` 替代（历史占位接口）。
 */
export type ResKey = string;

/**
 * @deprecated 使用 `createResService` + `ResScope.loadAny` 替代（历史占位接口）。
 */
export interface ResLoader {
    load<T>(key: ResKey): Promise<T>;
}
```

- [ ] **Step 2: 将 `assets/framework/res/index.ts` 写为**

```ts
export type { ResKey, ResLoader } from './legacy';
export type { ResService, ResScope } from './res-types';
export type { ResBundlesGateway } from './bundles';
export { createResService, ResServiceImpl } from './res-service';
export { ResScopeImpl } from './res-scope';
```

- [ ] **Step 3: Commit**

```bash
git add assets/framework/res/index.ts assets/framework/res/legacy.ts
git commit -m "refactor(res): 导出 createResService 并保留 legacy 类型"
```

> 说明：若你希望 **不新增** `legacy.ts`，也可把 `ResKey/ResLoader` 继续放在 `index.ts` 顶部；但必须保留 `ResKey` 的兼容导出（文档与其它 spec 仍引用）。

---

### Task 5: Vitest — `ResScope` 记账、dispose、preload、竞态

**Files:**
- Create: `tests/res.asset-manager.test.ts`

- [ ] **Step 1: 写入测试（完整可运行）**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Asset, AssetManager } from 'cc';
import { createResService } from '../assets/framework/res/res-service';
import { ResScopeImpl } from '../assets/framework/res/res-scope';

function createFakeAsset(name: string): Asset {
    return { name } as unknown as Asset;
}

function createFakeAssetManager() {
    const releaseAsset = vi.fn((asset: Asset) => {});
    const preload = vi.fn(async () => {});
    const loadAny = vi.fn(async (..._args: unknown[]) => createFakeAsset('A'));

    const am = { loadAny, preload, releaseAsset } as unknown as AssetManager;
    return { am, loadAny, preload, releaseAsset };
}

describe('res / assetManager facade', () => {
    it('loadAny success should acquire and dispose should release by count', async () => {
        const { am, releaseAsset, loadAny } = createFakeAssetManager();
        const svc = createResService(am);
        const scope = svc.openScope();

        const a1 = await scope.loadAny('uuid-or-path' as never);
        const a2 = await scope.loadAny('uuid-or-path' as never);

        expect(loadAny).toHaveBeenCalled();
        expect(a1).toBe(a2);

        scope.dispose();

        expect(releaseAsset).toHaveBeenCalledTimes(2);
        expect(releaseAsset).toHaveBeenCalledWith(a1);

        scope.dispose();
        expect(releaseAsset).toHaveBeenCalledTimes(2);
    });

    it('preload should not be tracked for dispose releases', async () => {
        const { am, releaseAsset, preload } = createFakeAssetManager();
        const svc = createResService(am);
        const scope = svc.openScope();

        await scope.preload('x' as never);
        scope.dispose();

        expect(preload).toHaveBeenCalled();
        expect(releaseAsset).toHaveBeenCalledTimes(0);
    });

    it('loadAny after dispose should reject', async () => {
        const { am } = createFakeAssetManager();
        const svc = createResService(am);
        const scope = svc.openScope();
        scope.dispose();
        await expect(scope.loadAny('x' as never)).rejects.toThrow(/disposed/);
    });

    it('if loadAny resolves after dispose started, it should release immediately and not leak', async () => {
        const { am, releaseAsset, loadAny } = createFakeAssetManager();

        let resolveLoad!: (a: Asset) => void;
        const p = new Promise<Asset>((resolve) => {
            resolveLoad = resolve;
        });
        loadAny.mockImplementationOnce(async () => p);

        const scope = new ResScopeImpl(am);
        const pending = scope.loadAny('x' as never);
        scope.dispose();

        resolveLoad(createFakeAsset('late'));
        const asset = await pending;

        expect(releaseAsset).toHaveBeenCalledTimes(1);
        expect(releaseAsset).toHaveBeenCalledWith(asset);
    });
});
```

- [ ] **Step 2: 运行测试（应失败：模块尚未导出/路径未配置）**

Run:

```bash
npm test -- tests/res.asset-manager.test.ts
```

Expected: FAIL（例如模块未实现、或测试 import 路径不匹配）

- [ ] **Step 3: 运行全量测试**

Run:

```bash
npm run typecheck
npm run lint
npm test
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/res.asset-manager.test.ts
git commit -m "test(res): 覆盖 ResScope 与 assetManager 对接语义"
```

---

### Task 6: 更新架构文档 `res/*` 现状描述

**Files:**
- Modify: `docs/architecture/ccc-framework.md`

- [ ] **Step 1: 在「最小 public API」章节中，找到 `res/*` 描述段落，将“仅 ResKey/ResLoader”更新为包含：**

- `createResService(am?)`
- `ResService.openScope()`
- `ResScope.loadAny/preload/dispose` 的职责一句话
- `ResBundlesGateway` 为占位扩展点

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/ccc-framework.md
git commit -m "docs(architecture): 更新 res 模块最小 public API 描述"
```

---

## Self-review（对照 spec 的覆盖表）

| Spec 要求 | 对应 Task |
|------------|-----------|
| `createResService` 默认 `assetManager` + 可注入 | Task 3 |
| `ResScope.loadAny` 成功记账 | Task 2、Task 5 |
| `dispose` 按次数 `releaseAsset` + 幂等 | Task 2、Task 5 |
| `preload` 不纳入自动释放 | Task 2、Task 5 |
| `dispose` 与并发/晚到 resolve（spec 6.2-A） | Task 2（`loadAny` resolve 后检查 `closed`）、Task 5 |
| `dispose` 错误不吞（AggregateError） | Task 2 |
| Bundle/Remote 仅占位 | Task 1 |
| `public` 可使用 `import type { Asset, AssetManager }` | Task 1 |
| Vitest 可测 | Task 5 |

---

## Plan complete

Plan complete and saved to `docs/superpowers/plans/2026-04-18-res-assetmanager.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个 Task 派生子代理执行，Task 间人工/代理复核，迭代快  
**2. Inline Execution** — 本会话按 Task 顺序直接改代码与跑测试（适合你想快速一条龙落地）

**Which approach?**
