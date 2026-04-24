# framework 启动流程设计（FrameworkBootstrap）

日期：2026-04-17  
范围：只定义“启动流程”的稳定约定与最小骨架；不引入编辑器扩展，不做过度设计。

## 1. 背景与目标

当前 demo 通过业务组件在 `start()` 中手动执行：

```ts
const app = new App();
app.start();
```

目标是把启动流程收敛为 Creator 场景中的**统一入口**：挂载一个组件即可自动启动框架，业务侧只负责配置与使用。

## 2. 设计原则（必须遵守）

- **显式启动**：禁止 import 即执行副作用；启动必须由组件在 `start()` 中显式触发。
- **base 保持纯 TS**：`assets/framework/base/**` 不直接依赖 `cc` 运行时。
- **Creator 绑定上移**：Creator `Component` 放在上层模块（不放进 base）。
- **组件职责收敛**：`FrameworkBootstrap` 只做初始化流程（组装 + 启动时序 + Context 交接），不负责跨场景单例策略或多实例校验。
- **不过度设计**：只定义稳定面（边界、最小 public API、组装顺序、错误策略、测试策略）。

## 3. 模块划分（新增/调整）

### 3.1 Creator 侧启动组件（上层模块）

建议新增：

- `assets/framework/ui/bootstrap/FrameworkBootstrap.ts`

职责：

- 在 Creator 生命周期 `start()` 中触发框架启动
- 读取/解析最小配置（mode/platform/flags）
- 调用 builder 组装框架运行时对象，并调用 `app.start()`

> 选择 `ui` 作为承载层的原因：其允许依赖 `base` 且可承载与引擎/UI 相关的绑定代码；同时保持 `base` 纯 TS。

### 3.2 纯 TS 组装入口（base/app）

建议新增：

- `assets/framework/base/app/builder.ts`（或 `build.ts`）

职责（纯 TS）：

- 组装最小运行时对象：`Env`、`Container`、`EventBus`、`Lifecycle`、`Context`、`App`
- 返回组装结果供 Creator 侧持有/调用（例如 `{ app, context, lifecycle }`）

### 3.3 现有 `App`（base/app）

现状：

- `assets/framework/base/app/index.ts` 已存在 `App` 与 `AppOptions` 的最小形态，且 `start/stop` 幂等。

约定：

- `App` 继续保持“启动编排入口”的语义；不在模块顶层做任何注册或副作用。

## 4. 启动时序（最小但完整）

### 4.1 组装与启动流程（在 `FrameworkBootstrap.start()`）

顺序（稳定约定）：

1. 组装 runtime（纯 TS builder）
   - `env = createEnv({ mode, platform?, flags? })`
   - `container = new Container()`
   - `events = new EventBus<...>()`（初期可用 `EventMap`）
   - `lifecycle = new Lifecycle()`
   - `context = createContext({ env, container, events })`
   - `app = new App({ env, container })`
2. 启动事件与启动动作
   - `await lifecycle.emit('boot')`
   - `app.start()`
   - `await lifecycle.emit('start')`

> 说明：`Lifecycle.emit()` 当前实现为同步分发 + 微任务边界，不保证 await 订阅者完成；本设计不在此阶段定义“是否等待全部订阅者”的强语义，避免过度设计。

### 4.2 停止与销毁（可选扩展）

为保持最小骨架，本设计不强制实现 stop/shutdown 链路。若后续需要，可在 `FrameworkBootstrap.onDestroy()` 增加：

- `app.stop()`
- `await lifecycle.emit('shutdown')`

### 4.3 启动产物交接（只交接 Context）

背景：

- `FrameworkBootstrap` 作为“启动场景组件”，可能在切场景后销毁。
- App/Context 是否跨场景持久化由业务层决定；框架层只负责**创建与交接**，不内置全局单例策略。

约定（稳定接口）：

- `FrameworkBootstrap` 提供一个可配置的“接收者”引用（Creator Inspector 可拖拽）。
- 当启动成功并得到 `Context` 后，若接收者实现了约定方法 `onFrameworkContext(ctx)`，则立即调用该方法完成交接。
- 框架层只交接 `Context`（包含 `env/container/events`），不交接 `App`，避免扩大公共面；业务层如需单例自行保存 `ctx` 或从 `ctx.container` 继续注册/获取服务。

触发时机：

- 建议在 `app.start()` 之后、`lifecycle.emit('start')` 之前调用 `onFrameworkContext(ctx)`，使业务层能在 start 阶段注册/订阅必要能力。

错误策略：

- receiver 为空：跳过，不报错
- receiver 未实现 `onFrameworkContext`：跳过，可选 warn（不强制）
- receiver 方法抛错：向上抛出（fail-fast），启动失败

### 4.4 对外可读 Context（getter）

约定（稳定接口）：

- `FrameworkBootstrap` 提供 `context` getter：启动完成后可读取 `Context`；启动前读取应抛错（避免业务误用“未就绪的上下文”）。

销毁行为：

- 预期：`onDestroy()` 时清空内部持有的 `Context`，避免“组件已销毁但仍被外部引用”带来的误用。
- 现状（以代码为准）：当前 `assets/framework/ui/bootstrap/FrameworkBootstrap.ts` 的 `onDestroy()` 为空，未发现显式清空逻辑；因此不建议在组件销毁后继续持有/读取其 `context`。

## 5. 配置来源（Creator Inspector 友好）

`FrameworkBootstrap` 暴露最小配置字段：

- `mode: 'dev' | 'prod'`（默认 `dev`）
- `platform?: string`
- `flagsJson?: string`（可选 JSON 字符串；解析失败则报错并停止启动）

`flagsJson` 解析结果转换为 `Record<string, boolean>` 注入 `createEnv({ flags })`。

## 6. 错误处理（fail-fast）

### 6.1 配置解析失败（flagsJson）

- **行为**：`throw new Error('Invalid flagsJson: ...')`
- **原因**：禁止静默降级，避免开关配置“看似生效但其实没生效”

### 6.2 启动阶段异常

包含 builder / lifecycle emit / app.start 过程中的异常：

- **行为**：异常向上抛出，交由 Creator 控制台输出
- **不做**：吞错、自动重试（后续需要再单独设计）

## 7. 测试策略（不过度设计）

### 7.1 纯 TS 可测部分（Vitest）

覆盖范围：

- `base/app/builder.ts`：能组装出 `env/container/events/lifecycle/context/app`；`flagsJson`（若由 builder 解析）行为正确
- `base/app`：`App.start/stop` 幂等

说明：

- 测试不依赖 `cc` 运行时
- 通过 `@fw/*` alias 在 Node/Vitest 下运行

### 7.2 Creator 侧手工验证（demo 场景）

不写自动化测试，先通过 demo 场景验证：

- 挂 1 个 `FrameworkBootstrap`：能启动
- 挂 2 个：各自都会执行初始化流程（本组件不做单例/多实例校验）

验证场景与脚本（以当前仓库为准）：

- 场景：`assets/demo/app-dev.scene`（已从 `assets/demo/app.scene` 迁移）
- 业务接收者组件脚本示例：`assets/demo/AppDev.ts`

> 说明：历史文件 `assets/demo/app_scene.ts` 已移除；如文档或旧链接仍引用该文件，应一并更新为上面两项。

### 7.3 对外接入示例（伪代码）

业务侧（Creator 组件）实现 `onFrameworkContext(ctx)`：

```ts
import type { Context } from '@fw/base/context';
import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass('GameEntry')
export class GameEntry extends Component {
  onFrameworkContext(ctx: Context) {
    // 在这里保存 ctx / 从 ctx.container 获取服务 / 订阅 ctx.events 等
    // 注意：该回调在 app.start() 之后、lifecycle.emit('start') 之前触发
  }
}
```

场景绑定（Inspector 操作要点）：

- 在场景中找到挂载 `FrameworkBootstrap` 的节点
- 将业务组件（例如 `GameEntry` 所在节点上的组件）拖拽到 `FrameworkBootstrap.contextReceiver`
- 运行场景后，`FrameworkBootstrap` 会在启动流程中调用 `contextReceiver.onFrameworkContext(ctx)`（若该方法存在）

## 8. 工具链 / ESLint（cc 声明策略）

目标：让 TypeScript/ESLint 在不手写 `declare module 'cc'` 的前提下，正确识别 Cocos Creator 的类型声明，并减少引擎声明带来的外部噪声错误。

当前策略（以 `tsconfig.eslint.json` 为准）：

- 在 `compilerOptions.types` 中引入 Creator 声明：`temp/declarations/cc.custom-macro`、`jsb`、`cc`、`cc.env`
- 为配合引擎 `.d.ts`：`lib` 包含 `DOM`（引擎声明会引用 DOM 相关类型），并启用 `skipLibCheck: true`（避免引擎/第三方声明导致大量外部类型错误干扰 lint）
- 启用 `experimentalDecorators: true`（Creator 装饰器语法需要）
- **移除**手写的 ESLint 类型桩：不再使用 `types/eslint/cc.d.ts` 这类 `declare module 'cc'`，避免与 Creator 自带声明冲突

## 9. 验收标准（Definition of Done）

- 有一个 Creator 侧统一入口组件（`FrameworkBootstrap`），能在 `start()` 触发启动。
- base 保持纯 TS：builder 与 App 组装不依赖 `cc`。
- 单实例约束生效：重复启动会抛错并停止。
- 纯 TS 部分可在 Vitest 下测试通过。

