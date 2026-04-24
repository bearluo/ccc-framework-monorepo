# ccc-framework 框架设计规范（Spec）

日期：2026-04-16  
定位：定义 `ccc-framework` 的**稳定框架骨架**（分层、边界、公共入口、最小 public API 形态）。本 spec 不追求一次性完备，重点是避免过度设计与后续返工。

## 1. 背景与约束

- **引擎/编辑器**：Cocos Creator 3.8.8
- **交付方式**：以 Creator 资源包对外交付
- **交付内容**：资源包只包含 TypeScript 脚本
- **交付根目录**：`assets/framework/`

## 2. 目标（Goals）

- 建立清晰的框架分层与依赖方向，确保可演进、可维护。
- 统一公共入口与 import 规则，降低重构成本。
- 定义最小 public API 形态，让后续实现与调用方开发都有“共同契约”。

## 3. 非目标（Non-goals）

- 不引入编辑器扩展（`editor` 脚本、菜单、面板等）。
- 不在本阶段定义具体业务玩法（`gameplay` 仅作为可选示例层）。
- 不引入 prefab/贴图/音频等资源；`ui/` 仅为代码层框架。
- 不在本 spec 里确定复杂策略细节（如 net 重试策略、res 缓存淘汰算法、storage 迁移细则）；仅预留扩展点。

## 4. 交付边界（必须遵守）

- **唯一交付根目录**：只交付 `assets/framework/`。
- **资源类型约束**：`assets/framework/` 下不应出现非脚本资源。

## 5. 分层与目录结构（基线）

资源包根目录：

- `assets/framework/`
  - `base/`：框架语义层（规则最严格）
    - `app/`：启动编排与入口
    - `lifecycle/`：生命周期钩子与调度抽象
    - `event/`：事件总线/消息机制（typed events）
    - `context/`：全局上下文（运行时对象汇聚）
    - `time/`：计时/节流去抖/调度抽象
    - `di/`：依赖注入/服务注册（轻量容器）
    - `env/`：环境/平台信息抽象
    - `decorators/`：带框架语义装饰器入口（仅语义，不绑定实现策略）
  - `utils/`：纯 TS 工具（不依赖其它层）
  - `storage/`：持久化能力抽象与实现（可迭代）
  - `net/`：网络能力抽象与实现（可迭代）
  - `res/`：资源加载门面（对接 assetManager，细节后补）
  - `ui/`：UI 代码层框架（不携带资源）
  - `gameplay/`：可选玩法/示例层（其它层禁止依赖）

## 6. 依赖方向规则（强约束）

### 6.1 允许的依赖

- `utils`：不依赖任何模块
- `base` → `utils`
- `storage/net/res/ui` → `base`、`utils`
- `gameplay` → 允许依赖 `storage/net/res/ui/base/utils`

### 6.2 禁止的依赖

- `utils` 依赖任何模块（禁止）
- `base` 依赖 `storage/net/res/ui/gameplay`（禁止）
- `storage/net/res/ui` 依赖 `gameplay`（禁止）
- 任何环依赖（禁止）

### 6.3 落地方式（约定 + 工具）

- **约定层面**：跨模块引用统一使用 `@fw/...`，禁止跨层深相对路径。
- **工具层面**：后续实现计划中用 ESLint `no-restricted-imports` 或等价方案对依赖方向进行自动校验（本 spec 不规定具体配置细节）。

## 7. import 与公共入口（对外可见面）

### 7.1 `@fw/*` 别名约定

- **统一别名**：`@fw/*` → `assets/framework/*`
- **框架内部跨模块引用必须使用 `@fw/...`**：避免相对路径穿越导致的重构成本。

### 7.2 公共 API 入口规则（barrel）

- 每层对外导出统一通过该层 `index.ts`。
- 尽量避免跨层“深路径”直接 import 内部文件作为公共用法。

推荐的聚合导出风格（framework 内）：

```ts
export * as base from '@fw/base';
export * as utils from '@fw/utils';
```

## 8. 核心运行时对象（关系与最小形态）

本 spec 只定义“对象关系与职责边界”，不绑定具体实现细节。

### 8.1 `App`（启动编排）

- **职责**：显式启动框架；串联生命周期、上下文与最小服务初始化编排。
- **约束**：禁止 import 即执行副作用；启动必须通过显式调用触发。

最小 public API 形态（草案）：

- `interface AppOptions { env?: Env; container?: Container }`
- `class App { constructor(options?: AppOptions); start(): Promise<void> | void; stop?(): Promise<void> | void }`

### 8.2 `Context`（全局上下文）

- **职责**：聚合运行时必需的框架对象引用（如 `env/container/events`）。
- **约束**：不承载业务状态；只承载框架层“运行时句柄”。

最小 public API 形态（草案）：

- `interface Context { readonly env: Env; readonly container: Container; readonly events: EventBus<any> }`

### 8.3 `Container`（DI）

- **职责**：管理 token → provider；支持 factory 与 singleton；类型安全 token。

最小 public API 形态（草案）：

- `type Token<T> = symbol & { __type?: T }`
- `function createToken<T>(description: string): Token<T>`
- `class Container { register<T>(token: Token<T>, provider: () => T): void; registerSingleton<T>(token: Token<T>, provider: () => T): void; resolve<T>(token: Token<T>): T }`

### 8.4 `EventBus`（事件）

- **职责**：typed events 的最小消息机制；允许订阅/取消订阅/派发。

最小 public API 形态（草案）：

- `type Unsubscribe = () => void`
- `interface EventMap { [event: string]: unknown }`
- `class EventBus<Events extends EventMap> { on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): Unsubscribe; off<K extends keyof Events>(...): void; emit<K extends keyof Events>(event: K, payload: Events[K]): void }`

### 8.5 `Lifecycle`（生命周期）

- **职责**：提供框架生命周期事件的标准集合；如何与引擎回调绑定由实现决定。

最小 public API 形态（草案）：

- `type LifecyclePhase = 'boot' | 'start' | 'pause' | 'resume' | 'stop' | 'shutdown'`
- `interface Lifecycle { on(phase: LifecyclePhase, cb: () => void | Promise<void>): Unsubscribe }`

### 8.6 `Time` / 调度抽象

- **职责**：提供计时与调度的抽象接口；允许后续对接引擎 scheduler 或使用纯 JS 实现。

最小 public API 形态（草案）：

- `type Cancel = () => void`
- `interface Scheduler { setTimeout(cb: () => void, ms: number): Cancel; setInterval(cb: () => void, ms: number): Cancel }`

### 8.7 `Env`（环境）

- **职责**：统一提供 mode/platform/feature-flag 等环境信息入口；具体来源由实现决定。

最小 public API 形态（草案）：

- `interface Env { readonly mode: 'dev' | 'prod'; readonly platform?: string; getFlag?(key: string): boolean | undefined }`

### 8.8 `Decorators`（语义装饰器入口）

- **职责**：提供“框架语义”的装饰器入口（如服务声明、注入声明），但不强绑定反射/metadata/运行时策略。
- **约束**：如果装饰器需要运行时支持，应由实现阶段在 `base/decorators` 明确说明依赖与代价。

最小 public API 形态（草案）：

- `function Service(...): ClassDecorator`
- `function Inject(token: Token<any>): PropertyDecorator | ParameterDecorator`

## 9. 能力层（storage/net/res/ui）的最小门面

本 spec 仅定义“门面接口形态”，不规定策略细节。

### 9.1 `storage`

- `interface StorageDriver { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }`

### 9.2 `net`

- `interface HttpRequest { url: string; method: string; headers?: Record<string, string>; body?: unknown; timeoutMs?: number }`
- `interface HttpResponse { status: number; headers?: Record<string, string>; body?: unknown }`
- `interface HttpClient { request(req: HttpRequest): Promise<HttpResponse> }`

### 9.3 `res`

- `type ResKey = string`
- `interface ResLoader { load<T>(key: ResKey): Promise<T> }`

### 9.4 `ui`

- `interface UIManager { open(id: string, params?: unknown): Promise<void> | void; close(id: string): void }`

## 10. 错误与诊断（形态约定）

为便于跨层传递与统一处理，建议在实现阶段采用统一错误形态（本 spec 只规定“形态”，不规定完整码表）：

- `interface FwErrorLike { name: string; message: string; code?: string; cause?: unknown; meta?: Record<string, unknown> }`

约束：

- 能力层（`net/storage/res/ui`）对外抛出的错误应可被归一为上述形态。
- 框架核心（`base/app`）应在启动关键路径上保留足够诊断信息（code/meta/cause），但避免吞掉错误。

## 11. 代码组织与可测试性约束

- `utils/**` 必须保持纯 TS，可在 Node 环境独立编译与测试。
- `base/**` 默认也应可在 Node 环境独立编译；若某子模块必须依赖 Creator 运行时，需要在该子模块入口清晰隔离（实现阶段确定）。
- 避免隐式副作用：模块顶层不做全局注册/自动启动。

## 12. 兼容性与演进策略（轻量）

- **优先稳定 public API**：对外 API 尽量只从各层 `index.ts` 暴露。
- **破坏性变更**：一旦对外 API 发生破坏性变更，应在相应文档里记录（实现阶段补充“变更记录”规范）。
- **扩展点优先**：能力层策略以接口/可替换实现为优先，不把策略写死在 `base`。

