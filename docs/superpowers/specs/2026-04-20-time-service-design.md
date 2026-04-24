# TimeService（await 等待 + 容器化计时器服务）设计

> 目标：在 `@fw/base/time` 提供可 `await` 的等待能力，并提供一个可注册到 `Container` 的计时器服务 `TimeService`，方便业务集中管理计时器并在合适时机手动释放。
>
> 约束：**不**为 `Container` 增加 `dispose()`；`TimeService` 的释放由业务方手动触发。

## 1. 背景与问题

当前 `assets/framework/base/time/index.ts` 仅提供：

- `Scheduler.setTimeout / setInterval`（返回 `Cancel`）

业务若要等待一段时间，需要手写：

- `await new Promise((r) => setTimeout(r, ms))`

缺点：

- 等待逻辑与 `Scheduler` 注入不一致
- 计时器创建分散，缺少统一的“释放点”与可测试替身

## 2. 设计目标

- **模块级**：提供 `sleep(ms)`，让业务可直接 `await`。
- **容器级**：提供 `TimeService` 单例服务，集中创建/追踪计时器，并提供 `delay(ms)` / `delayOrCancelled(ms)`。
- **释放策略**：业务可在上下文/模块退出时显式调用 `time.dispose()` 统一清理所有仍存活的计时器，并终止所有未完成的 delay。

## 3. 公共 API（拟定）

### 3.1 `@fw/base/time`

- `export type Cancel = () => void`
- `export interface Scheduler { setTimeout(cb, ms): Cancel; setInterval(cb, ms): Cancel }`
- `export function createScheduler(): Scheduler`（默认基于全局 `setTimeout/setInterval`）
- `export function sleep(ms: number): Promise<void>`
  - 语义：纯函数等待；默认使用全局 `setTimeout`（不依赖容器）
- `export interface TimeService extends Scheduler`
  - `delay(ms: number): Promise<void>`
  - `delayOrCancelled(ms: number): Promise<boolean>`
  - `dispose(): void`
- `export const timeServiceToken: Token<TimeService>`
- `export function registerTimeService(container: Container, scheduler?: Scheduler): void`
  - 注册单例：`container.registerSingleton(timeServiceToken, () => new TimeServiceImpl(scheduler ?? createScheduler()))`

> 说明：`registerTimeService` 只负责注册，不强制 resolve；是否创建实例由业务决定。

### 3.2 取消/释放语义（强约定）

`TimeService.delay(ms)`：

- 正常等待：`resolve()`
- 若在等待过程中调用 `time.dispose()`（或对该次等待执行 cancel）：**`reject`**（抛出“已取消/已释放”错误）

`TimeService.delayOrCancelled(ms)`：

- 正常等待：`resolve(true)`
- 若被取消/释放：`resolve(false)`（**不抛错**）

`TimeService.dispose()`：

- 幂等
- 会取消该服务创建的所有仍存活的 timeout/interval
- 会终止所有未完成的 delay（使其按上述语义完成）

> 业务约定：若某个逻辑必须保证“等待完成才继续”，应使用 `delay()` 并显式处理取消异常；若希望“被释放就静默结束”，应使用 `delayOrCancelled()`。

## 4. 关键实现点（非代码）

- `TimeServiceImpl` 内部维护所有活跃的 `Cancel`（timeout/interval/delay）集合，`dispose` 时逐个取消并清空。
- `delay(ms)` 基于 `scheduler.setTimeout` 实现：
  - 创建 `Promise` 并记录该次 delay 的取消器
  - 超时到达时 resolve（若已 dispose 则走取消分支）
- `delayOrCancelled(ms)` 复用同一套机制，但将取消分支转为 `false`。
- 需要一个明确的取消错误类型（例如 `TimeServiceCancelledError` 或 `Error('TimeService disposed')`）。v1 可用 message 约定，后续再升级为专用 error class。

## 5. 使用示例（文档级）

### 5.1 模块级等待

```ts
import { sleep } from '@fw/base/time';

await sleep(200);
```

### 5.2 容器化服务 + 手动释放

```ts
import { registerTimeService, timeServiceToken } from '@fw/base/time';

registerTimeService(container);
const time = container.resolve(timeServiceToken);

const ok = await time.delayOrCancelled(1000);
// ... 在合适时机
time.dispose();
```

## 6. 测试策略（Vitest）

- `sleep(ms)`：可用真实计时器（小 ms）验证 resolve。
- `TimeService`：
  - `setTimeout`/`setInterval` cancel：与现有 `Scheduler` 测试风格一致
  - `delay(ms)`：
    - 正常情况下 resolve
    - dispose 后应 reject（断言 error message/类型）
  - `delayOrCancelled(ms)`：
    - 正常情况下 resolve `true`
    - dispose 后 resolve `false`
- 建议引入可控的 `Scheduler` fake（不依赖真实时间），避免 CI 不稳定。

## 7. 非目标（v1 不做）

- 为 `Container` 增加 `dispose()` 或自动资源回收
- 全局统一的 `AbortSignal` 支持（可在 v2 增补）
- 将 `Lifecycle.shutdown` 与 `TimeService.dispose` 自动绑定（由业务自行决定释放时机）

