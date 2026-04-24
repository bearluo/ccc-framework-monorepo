# ccc-framework

面向 **Cocos Creator 3.8.8** 的 TypeScript 框架资源包：以 `assets/framework/` 为唯一交付根目录，提供分层清晰的基础设施（启动、生命周期、事件、上下文、DI、环境、时间等）以及 storage / net / res / ui 等能力层门面。

## 环境要求

- **Cocos Creator**：3.8.8（与 `package.json` 中 `creator.version` 对齐）
- **Node.js**：用于本地脚本、类型检查、测试与格式化（建议当前 LTS）

## TypeScript / JS 语言基线（对齐 Creator）

根目录 **`tsconfig.json`** 继承 **`temp/tsconfig.cocos.json`**（由 Creator 生成/维护，勿手改该「基线」字段）。编写 **`assets/framework/`** 下将要打进 Creator 的代码时，应以该继承链上的编译选项为准，避免使用引擎侧未覆盖的新语法或模块形态。

摘自 `temp/tsconfig.cocos.json` 中与「能用哪些语言特性」直接相关的约定（若编辑器升级后该文件变更，以仓库内实际内容为准）：

| 选项 | 值 | 对编写的含义 |
|------|-----|----------------|
| `target` | `ES2015` | 生成的/假定的运行时代码基线为 ES2015；不要使用仅在高版本 ECMAScript 中才有的语法作为交付代码依赖（除非项目另有明确转译与运行时约定）。 |
| `module` | `ES2015` | 模块系统按 ES2015；与「裸 `import` 由打包链处理」并存时，仍应避免依赖仅 Bundler/较新 Node 才支持的写法。 |
| `moduleResolution` | `node` | 按 Node 风格解析模块路径。 |
| `isolatedModules` | `true` | 每个文件需可独立转译；避免依赖「整程序才成立」的 TypeScript 写法。 |
| `experimentalDecorators` | `true` | 装饰器按旧版实验语义；与 TC39 阶段装饰器不可混用。 |
| `forceConsistentCasingInFileNames` | `true` | 导入路径大小写需与磁盘一致。 |

根目录 `tsconfig.json` 在继承之上增加了 `paths`（`@fw`）等；其中 **`strict` 等与基线不一致的覆盖项** 以根 `tsconfig.json` 为准。

**注意：`npm run typecheck` 当前使用 `tsconfig.eslint.json`**，其中 `target` / `module` 等为较新版本（便于工具链），**不能**代表 Creator 对 `assets/framework/` 的编译基线。改框架交付代码前，应用 Creator 继承链或编辑器编译结果核对，避免「本地 typecheck 通过但在 Creator 中不可用」的情况。

## 目录说明

| 路径 | 说明 |
|------|------|
| `assets/framework/` | 框架脚本交付根目录；对外只应交付此目录下的 TypeScript |
| `tests/` | Vitest 单元测试 |
| `docs/architecture/ccc-framework.md` | 分层、依赖方向、`@fw` 别名等长期架构约定 |

## 在业务项目中引用（`@fw`）

框架内部与接入方项目应统一通过 **`@fw/*`** 解析到 `assets/framework/*`：

- 本仓库：`tsconfig.json` 的 `compilerOptions.paths` 与根目录 `import-map.json` 已配置 `@fw` / `@fw/*`。
- 将资源包接入其它 Creator 工程时，需保持相同的 paths / import map 解析规则；详见架构文档中的「import 规则」与「接入方要求」。

示例：

```ts
import { App } from '@fw/base/app';
import { createEnv } from '@fw/base/env';
import { Container, createToken } from '@fw/base/di';
```

## 常用命令

```bash
npm run typecheck   # TypeScript 检查（tsconfig.eslint.json）
npm run lint        # ESLint
npm run format      # Prettier 格式化
npm run test        # Vitest
```

## 文档

- [架构与边界约定](docs/architecture/ccc-framework.md)
- 设计与草案：[docs/superpowers/specs/2026-04-16-ccc-framework-spec.md](docs/superpowers/specs/2026-04-16-ccc-framework-spec.md)

## 许可证

本项目为私有仓库（`package.json` 中 `"private": true`）。若后续开源，请在此补充许可证条款。
