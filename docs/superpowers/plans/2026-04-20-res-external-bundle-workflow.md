# 外部 Bundle（独立 Creator 工程）工作流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Host 工程落地“外部 bundle（独立 Creator 工程产物）”的接入方式：通过 manifest 管理 `bundleName → baseUrl/version`，支持 dev/staging/prod 覆盖，并明确 web（MD5 Cache）与 native（版本化 URL）两套缓存治理策略。

**Architecture:** 不改动 `res` 的核心加载模型（仍是 `assetManager.loadBundle → ResBundleSession → bundle.load*`）。新增一层“配置/清单”能力：manifest 文件（或内存对象）+ 解析与校验 + 按环境选择。Host 侧在启动时把 `bundleName` 解析成 `baseUrl`，并调用现有 `ResService.loadBundle(nameOrUrl)` 传入 URL。

**Tech Stack:** TypeScript, Vitest, Cocos Creator 3.8.8（Host 工程），静态资源服务（dev 本地 server / staging&prod CDN）

---

## 文件结构（将要改动/新增）

（以下路径为建议落点；若你更偏好放在 `assets/framework/res/` 或 `assets/framework/base/`，实现时可调整，但需要保持边界：`base` 不依赖 `res`。）

- Create: `assets/framework/res/res-bundle-manifest.ts`
  - 定义 manifest 类型、解析/校验、环境选择逻辑
  - 提供“解析 bundleName → baseUrl”的纯函数
- Create: `assets/framework/res/res-bundle-manifest.test.ts`
  - manifest 解析/覆盖/校验单测（不依赖 Cocos 运行时）
- Create: `assets/demo/bundle-manifest.dev.json`（或 `.ts` 常量）
- Create: `assets/demo/bundle-manifest.prod.json`（或 `.ts` 常量）
- Modify: `assets/demo/app-dev.ts`
  - 演示：读取 manifest，加载外部 bundle（URL）并进入 `ResBundleSession.loadScene/load`
- Modify (optional, docs only): `docs/architecture/ccc-framework.md`
  - 在 `res` 小节补充 manifest 作为“推荐接入层”（不改变 res 的核心 API）

---

### Task 1: 定义 Manifest 数据结构与最小校验（纯 TS，不接触 cc）

**Files:**
- Create: `assets/framework/res/res-bundle-manifest.ts`
- Test: `assets/framework/res/res-bundle-manifest.test.ts`

- [ ] **Step 1: 写失败测试（缺字段应报错；覆盖策略正确）**

Create `assets/framework/res/res-bundle-manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickBundleBaseUrl, validateManifest } from './res-bundle-manifest';

describe('res / bundle manifest', () => {
    it('validate: requires baseUrl & version', () => {
        expect(() =>
            validateManifest({
                bundles: {
                    gameA: { baseUrl: 'http://x/', version: '1.0.0' },
                },
            }),
        ).not.toThrow();

        expect(() =>
            validateManifest({
                bundles: {
                    gameA: { baseUrl: 'http://x/' } as any,
                },
            } as any),
        ).toThrow(/version/i);
    });

    it('pickBundleBaseUrl: chooses env override when present', () => {
        const m = validateManifest({
            bundles: {
                gameA: {
                    version: '1.0.0',
                    baseUrl: 'https://cdn.example.com/gameA/1.0.0/',
                    env: {
                        dev: { baseUrl: 'http://127.0.0.1:8080/gameA/dev/' },
                    },
                },
            },
        });
        expect(pickBundleBaseUrl(m, 'gameA', 'dev')).toMatch(/127\.0\.0\.1/);
        expect(pickBundleBaseUrl(m, 'gameA', 'prod')).toMatch(/cdn\.example/);
    });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test`  
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 manifest 类型与函数（最小可测）**

Create `assets/framework/res/res-bundle-manifest.ts`:

```ts
export type ResEnv = 'dev' | 'staging' | 'prod';

export type BundleEntry = {
    baseUrl: string;
    version: string;
    env?: Partial<Record<ResEnv, { baseUrl: string }>>;
};

export type BundleManifest = {
    bundles: Record<string, BundleEntry>;
};

export function validateManifest(input: BundleManifest): BundleManifest {
    if (!input || typeof input !== 'object') throw new Error('manifest: invalid');
    if (!input.bundles || typeof input.bundles !== 'object') throw new Error('manifest: bundles missing');
    for (const [name, e] of Object.entries(input.bundles)) {
        if (!e || typeof e !== 'object') throw new Error(`manifest: bundle '${name}' invalid`);
        if (!e.baseUrl) throw new Error(`manifest: bundle '${name}' baseUrl missing`);
        if (!e.version) throw new Error(`manifest: bundle '${name}' version missing`);
    }
    return input;
}

export function pickBundleBaseUrl(manifest: BundleManifest, bundleName: string, env: ResEnv): string {
    const e = manifest.bundles[bundleName];
    if (!e) throw new Error(`manifest: unknown bundle '${bundleName}'`);
    return e.env?.[env]?.baseUrl ?? e.baseUrl;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add assets/framework/res/res-bundle-manifest.ts assets/framework/res/res-bundle-manifest.test.ts
git commit -m "feat(res): 增加外部 bundle manifest 的类型与校验/选择逻辑"
```

---

### Task 2: 将 manifest 接入 demo（按 URL 加载 bundle）

**Files:**
- Create: `assets/demo/bundle-manifest.dev.json` (or `.ts`)
- Modify: `assets/demo/app-dev.ts`

- [ ] **Step 1: 选择 manifest 表达方式（JSON vs TS 常量）**

推荐 **TS 常量**（类型可校验、无运行时 JSON 读取成本）。若必须 JSON，则由 Creator 资源系统加载（会带来额外路径与平台差异），v1 不建议。

- [ ] **Step 2: 添加 dev manifest 示例（TS 常量）**

Create `assets/demo/bundle-manifest.dev.ts`:

```ts
import { validateManifest } from '@fw/res/res-bundle-manifest';

export const demoManifest = validateManifest({
    bundles: {
        gameA: {
            version: 'dev',
            baseUrl: 'http://127.0.0.1:8080/gameA/dev/',
        },
    },
});
```

- [ ] **Step 3: 修改 demo 使用 manifest 选择 baseUrl 并加载**

Modify `assets/demo/app-dev.ts`（示意，按你们 demo 现状调整）：

```ts
import { pickBundleBaseUrl } from '@fw/res/res-bundle-manifest';
import { demoManifest } from './bundle-manifest.dev';

// ...
const baseUrl = pickBundleBaseUrl(demoManifest, 'gameA', 'dev');
const session = await ctx.container.resolve(resServiceToken).loadBundle(baseUrl);
// 然后 session.loadScene(...) 或 session.load(...)
```

- [ ] **Step 4: 类型检查**

Run: `npm run typecheck`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add assets/demo/app-dev.ts assets/demo/bundle-manifest.dev.ts
git commit -m "demo(res): 演示通过 manifest 加载外部 bundle URL"
```

---

### Task 3: 文档补强（把 web/native 缓存策略落到“怎么做”）

**Files:**
- Modify: `docs/superpowers/specs/2026-04-20-res-external-bundle-workflow-design.md`

- [ ] **Step 1: 增加 manifest JSON/TS 示例片段**

在 spec 的 §3.2 或附录中加入示例，展示：
- web：`baseUrl` 可稳定，依赖 `MD5 Cache`
- native：`baseUrl` 必须版本化目录

- [ ] **Step 2: 提交**

```bash
git add docs/superpowers/specs/2026-04-20-res-external-bundle-workflow-design.md
git commit -m "docs(spec): 补充外部 bundle manifest 示例与缓存落地做法"
```

---

## 自检清单（执行者必做）

- 所有新增导出是否符合边界：`res` 可以依赖 `base`，不要反向依赖。
- Demo 不应强依赖真实 CDN；默认走 dev manifest（localhost）。
- 测试不应依赖真实计时器/真实网络。

