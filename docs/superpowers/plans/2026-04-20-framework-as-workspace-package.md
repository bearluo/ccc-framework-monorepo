# Framework as workspace package (`@ccc/fw`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `assets/framework/**` 迁移为 monorepo workspace npm 包 `@ccc/fw`（产出 `dist/*.js + *.d.ts`），并让 Host 工程与 `external/game-bundles/game-template` 通过 `import-map.json` 解析 `@ccc/fw`。

**Architecture:** 新增 `packages/fw` workspace 包与构建脚本（tsc 输出 ESM + d.ts）。过渡期保留现有 `@fw/` 映射与 `assets/framework/**`，先让 `@ccc/fw` 能在运行期解析，再分阶段迁移模块（base→res→ui/gameplay），逐步把代码 import 改到 `@ccc/fw`。不使用 assets shim 兜底。

**Tech Stack:** TypeScript (tsc), npm workspaces, Cocos Creator import-map, Vitest

---

## 文件结构（将要改动/新增）

- Modify: `package.json`
- Modify: `import-map.json`
- Modify: `external/game-bundles/game-template/import-map.json`
- Create: `packages/fw/package.json`
- Create: `packages/fw/tsconfig.json`
- Create: `packages/fw/src/index.ts`
- Create: `packages/fw/src/base/index.ts`（Phase 1 起步）
- Create: `packages/fw/src/base/di/index.ts`（以及 base 下若干模块，按 Phase 1 选定范围）
- (Later) Create: `packages/fw/src/res/**`、`packages/fw/src/ui/**`、`packages/fw/src/gameplay/**`
- Modify (gradual): `assets/framework/**`（迁移时删除/或保留到最后统一删）

> 注：`dist/` 推荐不提交；由本地/CI 构建生成。需要相应 `.gitignore`（若当前仓库未覆盖）。

---

### Task 1: 建立 workspace 包骨架 + 可构建 dist

**Files:**
- Modify: `package.json`
- Create: `packages/fw/package.json`
- Create: `packages/fw/tsconfig.json`
- Create: `packages/fw/src/index.ts`

- [ ] **Step 1: 写一个失败的构建检查（dist 未生成）**

Run: `npm run fw:build`  
Expected: FAIL（脚本不存在）。

- [ ] **Step 2: 在根 `package.json` 增加 workspaces 与构建脚本**

在根 `package.json` 增加（示意）：

```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "fw:build": "tsc -p packages/fw/tsconfig.json"
  }
}
```

- [ ] **Step 3: 创建 `packages/fw/package.json`**

```json
{
  "name": "@ccc/fw",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  }
}
```

> v1 只需要主入口 export；子路径 export（如 `@ccc/fw/base`）后续再加。

- [ ] **Step 4: 创建 `packages/fw/tsconfig.json`（输出 ESM + d.ts）**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": false,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 5: 创建 `packages/fw/src/index.ts`（最小可编译）**

```ts
export const __fw = 'workspace';
```

- [ ] **Step 6: 运行构建，确认生成 dist**

Run: `npm run fw:build`  
Expected: PASS；生成 `packages/fw/dist/index.js` 与 `index.d.ts`。

- [ ] **Step 7: 提交**

```bash
git add package.json packages/fw
git commit -m "chore: 增加 @ccc/fw workspace 包骨架与构建脚本"
```

---

### Task 2: import-map 接入 `@ccc/fw`（仍保留 `@fw/`）

**Files:**
- Modify: `import-map.json`
- Modify: `external/game-bundles/game-template/import-map.json`

- [ ] **Step 1: 写一个最小的 smoke 文件验证解析路径（typecheck 级别）**

在 Host 工程 `assets/demo/`（或任一可编译目录）创建临时文件 `assets/demo/fw-smoke.ts`：

```ts
import { __fw } from '@ccc/fw';
console.log(__fw);
```

- [ ] **Step 2: 运行 typecheck，确认失败（import-map 未接入不一定影响 tsc；若不失败则继续下一步）**

Run: `npm run typecheck`

> 说明：tsc 不读 import-map；若此步未失败，需要在 tsconfig.paths 中临时加 `@ccc/fw` 指向 `node_modules/@ccc/fw/dist`（仅用于 IDE/typecheck），但不把它当运行期真相。

- [ ] **Step 3: 修改 Host `import-map.json` 增加 `@ccc/fw/` 映射**

示例：

```json
{
  "imports": {
    "@fw/": "./assets/framework/",
    "@ccc/fw/": "./node_modules/@ccc/fw/dist/"
  }
}
```

- [ ] **Step 4: 修改 game-template `import-map.json` 同样增加映射**

保持相对路径正确指向该工程的 node_modules。

- [ ] **Step 5: 构建 `@ccc/fw` 并运行 typecheck**

Run: `npm run fw:build`  
Run: `npm run typecheck`

- [ ] **Step 6: 删除 smoke 文件（避免污染）并提交 import-map 变更**

```bash
git add import-map.json external/game-bundles/game-template/import-map.json
git commit -m "chore: import-map 接入 @ccc/fw（过渡期保留 @fw）"
```

---

### Task 3: Phase 1 迁移 `base/di`（最小闭环）

**Files:**
- Create: `packages/fw/src/base/di/index.ts`
- Create: `packages/fw/src/base/index.ts`
- Modify: `packages/fw/src/index.ts`
- Modify (transition): `assets/framework/base/di/index.ts`（改为 re-export 或保持不动，择一）

- [ ] **Step 1: 写失败测试（workspace 包可用 Container）**

在 `tests/` 新增用例（或复用现有）：

```ts
import { describe, expect, it } from 'vitest';
import { base } from '@ccc/fw';

describe('@ccc/fw base.di', () => {
  it('Container resolves singleton', () => {
    const c = new base.di.Container();
    const tok = base.di.createToken<number>('n');
    c.registerSingleton(tok, () => 1);
    expect(c.resolve(tok)).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`  
Expected: FAIL（尚未导出 base/di）。

- [ ] **Step 3: 迁移实现到 `packages/fw/src/base/di/index.ts`**

把 `assets/framework/base/di/index.ts` 的实现复制到新位置（保持代码一致）。

- [ ] **Step 4: 连接聚合出口**

`packages/fw/src/base/index.ts`：

```ts
export * as di from './di';
```

`packages/fw/src/index.ts`：

```ts
export * as base from './base';
export const __fw = 'workspace';
```

- [ ] **Step 5: 构建包并跑测试**

Run: `npm run fw:build`  
Run: `npm test`

- [ ] **Step 6: 提交**

```bash
git add packages/fw tests
git commit -m "feat: @ccc/fw 迁移 base.di 并提供聚合出口"
```

---

### Task 4: Phase 2 迁移 `res`（含 manifest 工具）并在 game-template/host 演示

**Files:**
- Create: `packages/fw/src/res/**`
- Modify: `packages/fw/src/index.ts`
- Modify: `assets/demo/app-dev.ts`（逐步改 import 到 `@ccc/fw`）

- [ ] **Step 1: 选定最小 res 子集（先保证外部 bundle manifest 路径）**
- [ ] **Step 2: 逐文件迁移 + build + tests**
- [ ] **Step 3: demo 改用 `@ccc/fw` 引用，typecheck/test 通过**
- [ ] **Step 4: 提交**

（此任务在开始前应先列出确切文件清单；避免一次迁移过大。）

---

## 自检（写完计划后执行者需跑）

- `npm run fw:build`
- `npm run typecheck`
- `npm test`

