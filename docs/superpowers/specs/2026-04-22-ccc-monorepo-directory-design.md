# Cocos Creator 大厅子游戏 Monorepo 目录结构设计

**日期**：2026-04-22  
**状态**：设计规格（迁移由工程方自行完成，本文不规定迁移步骤与脚本）

## 1. 目标与范围

- **目标**：约定「大厅 + 多子游戏」场景下，使用 **npm workspaces** 在单仓内管理多个 **独立 Cocos Creator 工程**，并通过 `packages/*` 共享 **纯 TypeScript/JavaScript 运行时库**。
- **范围**：仅 **顶层与一级子目录的职责与命名**；不规定 Creator 版本、构建管线实现、子游戏动态加载实现细节。
- **非目标**：不在共享 npm 包中承载 Prefab、场景、图集等需在编辑器中直接引用的资源；不强制增加 `docs/`、`scripts/` 等业务顶层目录。

## 2. 顶层结构（必选）

仓库根目录下，**必选的业务目录**仅以下两项：

```
<repo-root>/
  apps/                 # 独立 Cocos Creator 工程（大厅、各子游戏）
  packages/             # 纯 TS/JS 运行时库（npm workspace 包）
```

为启用 **npm workspaces**，根目录 **必须** 存在 `package.json`（声明 `workspaces`），并通常配合 `package-lock.json`。二者属于 npm 根配置，**不**计为第三类「业务顶层目录」。

根目录允许存在常规工程文件（如 `.gitignore`、`.npmrc`、`README.md`），本规格不将其列为必选。

## 3. `apps/` 约定

- **含义**：每个子目录是一个 **完整、可单独用 Cocos Creator 打开** 的工程（含各自 `assets/`、`settings/` 等 Creator 默认结构）。
- **大厅**：建议使用 `apps/lobby`（名称可按团队习惯调整，但应在全仓统一）。
- **子游戏**：建议使用 `apps/game-<slug>`，`<slug>` 为 **kebab-case**，与包名、路由标识等团队规范对齐。
- **布局**：采用 **扁平** 结构，即子游戏直接位于 `apps/` 下，**不**强制使用 `apps/games/<name>` 分组；若子游戏数量显著增多，可在后续修订规格时引入分组，不作为本版默认。
- **依赖**：各 `apps/<name>/package.json` 通过 **`workspace:*`**（或与团队统一的 workspace 写法）引用 `packages/*` 中包；不在本规格中规定 Creator 内如何解析 `node_modules` 中源码或构建产物的具体配置。

## 4. `packages/` 约定

- **含义**：可发布的 **纯运行时** 逻辑（协议、日志、与子游戏/大厅之间的 **契约**、通用工具等）。
- **结构**：每个包占 `packages/<pkg>/` 目录，内含标准 npm 元数据（`package.json`）、源码目录（如 `src/`）及构建输出（如 `dist/`，由 `main` / `module` / `types` 或 `exports` 字段声明）。
- **包名**：推荐使用 **scoped name**（例如 `@ccc/<pkg>`），降低与公共 registry 命名冲突风险；scope 字符串由团队自行确定并在全仓统一。
- **边界**：禁止将「某一子游戏专属场景逻辑」作为公共包的长期归宿；公共包应保持可被大厅与任意子游戏复用。

## 5. Workspaces 声明（根 `package.json`）

根 `package.json` 应通过 workspaces 包含两类目录，例如：

- `apps/*`
- `packages/*`

具体 glob 以实现时 npm 版本行为为准；原则是 **大厅与各 Creator 工程**、**各共享库** 均被纳入同一 workspace 图，在仓库根执行一次安装即可链接本地包。

## 6. 与「仅要目录结构、自行迁移」的关系

- 本文档仅作为 **目录与职责** 的约定，供将 **已有大厅/子游戏工程** 迁入 `apps/`、将 **已有或可抽离的 TS 库** 迁入 `packages/` 时对照。
- **迁移顺序、Git 历史、资源路径批量替换** 等由执行迁移的一方自行决定，不在本规格范围内。

## 7. 测试与质量（目录层面）

- **单元测试**：优先在 `packages/*` 内随各包维护；不要求为测试单独增加新的顶层目录。
- **`apps/*`**：测试与质检方式遵循各 Creator 工程约定，本规格不新增顶层测试目录。

## 8. 自检记录（规格成文时）

- 无 `TBD`/未完成占位。
- 与前期澄清一致：workspaces **A**、`apps/` 承载独立 Creator 工程、`packages/` 为纯 TS/JS 运行时库、顶层业务目录 **仅** `apps/` 与 `packages/`。
- 范围限于目录结构；实现计划见后续 `writing-plans` 产出。
