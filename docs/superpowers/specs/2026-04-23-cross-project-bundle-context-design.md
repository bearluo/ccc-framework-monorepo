# 跨项目加载 Remote Bundle 与 Context 传递设计

**日期**：2026-04-23  
**状态**：已确认的设计规格  
**范围**：在 **同一进程、同一 Cocos Creator 引擎实例** 下，由 **Host 工程** 通过 `assetManager.loadBundle(URL)` 加载 **子游戏工程** 构建的 **remote bundle**；**`@ccc/fw` 强共享**（子 bundle 不重复打包 `fw`）；子游戏 **自建 `gameContext`**，与 Host 的 **`hostContext` 在 `env` / `events` / `container` 三要素上均隔离**；子游戏通过 Host 传入的 **`hostContext` 引用** 与 Host 交互。

## 1. 背景与目标

- 大厅（`host`）需要动态加载子游戏资源包，并在进入子游戏场景前完成框架装配。
- 子游戏需要一套 **独立的运行时上下文**（DI、事件、环境），避免与 Host 隐式耦合。
- 同时子游戏必须能 **显式** 访问 Host 的框架能力（网络、账号、大厅生命周期等），用于与 Host 协作。

## 2. 约束与前提（已确认）

| 项 | 选择 |
|----|------|
| 运行时形态 | **A**：同进程、同引擎；Host 内 `loadBundle(URL)` |
| `@ccc/fw` | **强共享**：子游戏 remote bundle **不**重复打包 `@ccc/fw`（通过构建 external / 等价机制实现，细节见实现计划） |
| DI 容器 | **C**：子游戏 **`gameContext.container` 为新建实例**；**禁止**子容器 resolve 时隐式回退到 Host 容器 |
| `EventBus` | **隔离**：`gameContext.events` **≠** `hostContext.events`（不同实例） |
| `Env` | **隔离**：`gameContext.env` **≠** `hostContext.env`（不同对象引用；子侧 `Env` 由子游戏创建） |

## 3. 核心概念：双 `Context`

### 3.1 `hostContext`（Host 上下文）

- **定义**：Host 当前正在使用的 `@ccc/fw` 类型 `Context` **引用**（同一对象引用传入子游戏侧）。
- **用途**：子游戏与 Host 的一切交互 **必须** 通过 `hostContext` 完成，包括但不限于：
  - `hostContext.events`：订阅/发布 Host 域事件；
  - `hostContext.container`：显式 `resolve` Host 已注册的 token（仅当 Host 选择暴露）；
  - `hostContext.env`：读取 Host 运行环境（只读使用，**不得**将其引用塞进 `gameContext.env`）。

### 3.2 `gameContext`（子游戏上下文）

- **定义**：子游戏在入口逻辑中调用 `createContext(...)` 得到的 `Context`。
- **组成**（三者全部与 Host 隔离）：
  - **`container`**：新建 `Container`，仅承载子游戏域服务；
  - **`events`**：新建 `EventBus`，仅承载子游戏域事件；
  - **`env`**：新建 `Env`（例如通过 `createEnv` 或等价工厂），**对象引用不与 `hostContext.env` 共享**。

### 3.3 从 Host 派生子 `Env` 的推荐方式（不破坏隔离）

Host 可在进入子游戏时额外提供 **`launchParams`（可序列化快照）**，例如：

- `mode`、`platform`、`flags` 等 **值拷贝**（或结构化只读数据）

子游戏使用快照 **构造自己的** `CreateEnvOptions` → `createEnv(...)` → 得到 **`childEnv`**，再 `createContext({ env: childEnv, ... })`。

**禁止**：`gameContext.env = hostContext.env` 或共享同一 `Env` 引用。

## 4. Host 编排流程（逻辑顺序）

1. **解析**：由 manifest（如 `pickBundleBaseUrl`）得到子游戏 remote bundle 的 `baseUrl`。
2. **加载**：通过 `ResService.loadBundle(baseUrl)`（或等价封装）获得 bundle 会话。
3. **定位入口**：在 `runScene` 之前定位子游戏入口（见第 5 节契约）。
4. **回调装配**：调用子游戏入口，并传入：
   - **`hostContext`**：Host 的 `Context` 引用；
   - **`launchParams`（可选但推荐）**：用于子游戏构造隔离 `Env` 的快照数据。
5. **子游戏侧**：创建 `childContainer`、`childEvents`、`childEnv` → `gameContext = createContext(...)`。
6. **切场景**：`director.runScene(...)`（与现有 demo 一致）。
7. **卸载**：释放 bundle 会话、清理子游戏在 `gameContext.events` 上的订阅、丢弃子容器注册（具体释放策略在实现计划中细化）。

**错误处理（流程级）**：

- `loadBundle` 失败：向上抛错，并可通过 `hostContext.events` 发出 `subgame.load_failed` 类事件（事件名在实现计划中定稿）。
- 入口缺失 / `onSubgameContext` 抛错：**不**进入子游戏场景或进入后立即回退策略二选一（实现计划定稿）。

## 5. 子游戏（remote bundle）契约

### 5.1 构建约束

- 子游戏 bundle **不得**将 `@ccc/fw` 再打一份进包体（与 Host 共享运行时模块）。
- 子游戏代码 **允许** import `@ccc/fw` 的类型与 API，但构建产物需满足 external 约定。

### 5.2 入口契约（推荐）

子游戏必须提供可被发现的一个入口（推荐：首场景某 `Component`），并实现：

- `onSubgameMount(payload: { hostContext: Context; launchParams?: unknown }): void | Promise<void>`

在方法体内完成 `gameContext` 创建与子域服务注册。

> 方法名可在实现计划中统一为团队最终命名；本规格只要求 **稳定、可发现、在 `runScene` 前可调用**。

## 6. 通信与反模式

### 6.1 允许

- 子游戏内部模块只使用 `gameContext`。
- 子游戏通过 `hostContext.events` / `hostContext.container` **显式**与 Host 协作。

### 6.2 禁止（反模式）

- 子游戏把 `hostContext.env` / `hostContext.events` / `hostContext.container` **直接赋值**进 `gameContext`（破坏隔离）。
- 子容器 resolve **隐式**回退到 Host 容器（破坏 **C**）。
- 默认把 `gameContext.events` 桥接到 `hostContext.events`（隐式耦合）；若确需转发，必须单独 `Bridge` 模块并在子 `container` 内显式注册（YAGNI：默认不做）。

## 7. 测试与验收（规格级）

- **单元**：`createContext` + `createEnv` 在给定 `launchParams` 下生成隔离 `env/events/container` 的组合测试（可脱离 Creator）。
- **冒烟**：Host 加载最小子 bundle，验证子游戏只通过 `hostContext` 能收到 Host 发出的事件；子游戏内部事件不污染 Host 总线。

## 8. 与现有 demo 的关系

- `apps/host/assets/demo/app-dev.ts` 当前演示了 `loadBundle` + `runScene` 与 `Context` 注入雏形；本规格将 **双 `Context`、总线/环境隔离、host 句柄传递** 固化为跨项目约定。

## 9. 自检记录（成文时）

- 无 `TBD`。
- 与对话结论一致：**A + 强共享 fw + 容器隔离 + events 隔离 + env 隔离**；Host 传 **`hostContext` 引用** 供子游戏与 Host 交互。
- 实现细节（入口发现顺序、`launchParams` 结构、external 配置）留给 **writing-plans**。
