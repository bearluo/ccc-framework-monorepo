# Framework 作为 workspace npm 包（`@ccc/fw`）设计

日期：2026-04-20  
背景：多项目（Host 工程 + 外部 game bundle 工程）共享 framework 代码；在 Cocos Creator 中 `tsconfig.paths` 更适合作为 IDE 别名，不应单独承担运行期/构建期解析职责。  
目标：将现有 `assets/framework/**` 迁移为 monorepo workspace 包 `@ccc/fw`（不发布），产出 `dist/*.js + *.d.ts`，并通过 Creator 的 `import-map.json` 完成真实模块解析。

## 0. 与现状的关系

- Host 工程目前通过 `import-map.json` 将 `@fw/` 映射到 `./assets/framework/`（game-template 也通过相对路径指到 Host 的 framework 目录）。
- `assets/framework/index.ts` 已是聚合命名空间出口（`export * as base/res/ui/...`），符合我们希望保留的对外使用习惯。
- 本 spec 只定义“迁移与接入契约”，不强制一次性全量替换；允许过渡期双前缀共存。

## 1. 目标 / 非目标

### 1.1 目标

- 将 framework 变成 workspace npm 包：`@ccc/fw`（`private: true`，不发布）。
- 包产物为 **ESM JS + d.ts**：`packages/fw/dist/**`。
- Host 与外部工程通过 `import-map.json` 将 `@ccc/fw` 指向 `node_modules/@ccc/fw/dist/`，实现“运行期/构建期可解析”。
- 对外入口保持**聚合命名空间风格**（A 方案）：支持 `import * as fw from '@ccc/fw'` 与 `fw.base/...` 等使用。
- 迁移可分阶段：先迁 `base`，再迁 `res`，再迁 `ui/gameplay/...`，每阶段都能独立验证。

### 1.2 非目标（v1 不做）

- 不发布到公共 npm registry（不做 semver 兼容承诺、公开 changelog 流程）。
- 不在 v1 内引入复杂的打包器（rollup/vite 等）；优先 `tsc` 直出 ESM。
- 不强制移除现有 `@fw/*` 立刻清零；允许过渡期保留。

## 2. 仓库结构（workspace）

### 2.1 根目录

- 根 `package.json` 增加 `workspaces`（例如 `["packages/*"]`）。
- 统一依赖安装在根目录：`npm i` 后生成根 `node_modules`，workspace 包通过链接方式可被多个工程引用。

### 2.2 `@ccc/fw` 包目录

推荐目录：

- `packages/fw/package.json`
- `packages/fw/src/**`
- `packages/fw/src/index.ts`（聚合出口）
- `packages/fw/dist/**`（构建输出，提交策略见 §6）

## 3. 包对外 API（聚合出口）

### 3.1 `packages/fw/src/index.ts`

保持与现有 `assets/framework/index.ts` 同构：

- `export * as base from './base'`
- `export * as res from './res'`
- `export * as ui from './ui'`
- ...

> 目的：让调用方可以 `import * as fw from '@ccc/fw'`，并通过 `fw.base.*` 使用（减少 import churn）。

### 3.2 子路径导出（可选）

允许同时支持 `@ccc/fw/base/*` 这类子路径导入（但 v1 不强制全量对齐 export map；以 Creator 解析与实际需求为准）。

## 4. Creator 的真实解析：以 `import-map.json` 为准

### 4.1 Host 工程 import-map

过渡期建议同时保留旧映射与新映射：

- `@fw/` → `./assets/framework/`（旧）
- `@ccc/fw/` → `./node_modules/@ccc/fw/dist/`（新）

最终目标：

- 仅保留 `@ccc/fw/` 映射

### 4.2 外部工程（game-template）import-map

外部工程应指向其自身工作区可见的 `node_modules/@ccc/fw/dist/`，避免跨工程相对路径读取 Host 的源码目录。

> 原因：跨工程直接读取 Host 的 `assets/framework` 会把“共享”变成“耦合”，并在后续独立仓库拆分时产生迁移成本。

## 5. 迁移策略（分阶段，低风险）

### Phase 1：`base` 迁移最小闭环

- 迁移 `assets/framework/base/**` 到 `packages/fw/src/base/**`
- 让 Host 工程中至少一个最小入口能在 `@ccc/fw` 下可解析并运行/构建

### Phase 2：`res` 迁移

- 迁移 `assets/framework/res/**`
- 验证外部 bundle manifest 工作流与 `ResBundleSession` 等不回退

### Phase 3：`ui` / `gameplay` 等

- 按模块迁移，保持每阶段可独立验证

### 过渡期规则

- 允许 `@fw/*` 与 `@ccc/fw/*` 共存，但每个模块迁移完成后应把新代码优先改为 `@ccc/fw`，逐步减少旧路径使用。

## 6. 构建、产物与提交策略

### 6.1 构建输出

- `packages/fw` 使用 `tsc` 输出：
  - `dist/**/*.js`（ESM）
  - `dist/**/*.d.ts`

### 6.2 `dist/` 是否提交

两种可选策略（v1 推荐 A）：

- **A（推荐）**：`dist/` 不提交；由 CI/本地脚本在打开 Creator 前构建一次（避免 repo 里出现大量产物 diff）。
- **B**：`dist/` 提交；减少“需要先 build 才能运行”的摩擦，但会带来产物噪声与冲突。

本仓库当前存在大量 Creator 产物目录（temp/library 等），为避免噪声，v1 推荐 **A**。

## 7. 验收标准

- Host 工程与 `external/game-bundles/game-template` 能同时引用 `@ccc/fw` 并成功解析。
- `tsconfig.paths` 不作为唯一解析来源：即使移除/失效，也不影响运行期解析（import-map 仍可用）。
- 分阶段迁移中，每阶段都可通过最小验证（typecheck + 关键 demo 运行）。

