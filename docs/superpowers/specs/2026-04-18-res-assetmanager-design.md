# res 模块设计：对接 `cc.assetManager`（MVP + 扩展点）

> **加载模型已被取代**：以 **Asset Bundle 为本地资源加载主轴** 的约定见 `docs/superpowers/specs/2026-04-18-res-bundle-centric-design.md`。本文档中关于「`ResScope` + `assetManager.loadAny` 作为推荐主路径」的章节仅作历史参考；会话记账、dispose 并发、preload 不自动 release 等**抽象语义**仍可参考。

日期：2026-04-18  
范围：定义 `@fw/res` 的最小稳定门面与生命周期边界；MVP 对齐主包/常规资源加载；Bundle/Remote 仅定义扩展点与后续里程碑。  
引擎基线：Cocos Creator 3.8.8（以项目 `package.json.creator.version` 为准）。

## 1. 背景

`assets/framework/res/index.ts` 当前仅有占位：

- `ResKey`
- `ResLoader.load<T>(key)`

架构文档已明确 `res/` 应对接 `assetManager`（见 `docs/architecture/ccc-framework.md`），但缺少可落地的类型边界、生命周期与扩展策略。

本 spec 目标是把 **MVP 可实现的公共面**写清楚，并避免把 Bundle/Remote 的复杂度提前塞进第一版实现。

## 2. 目标 / 非目标

### 2.1 目标（MVP）

- 提供 `ResService`：默认对接全局 `cc.assetManager`，并支持 **注入** `AssetManager`（便于单测/替换）。
- 提供 `ResScope` 作为 **推荐的加载入口**：在 scope 内产生的成功加载，按引用计数语义在 `dispose()` 时配对释放。
- 暴露 `preload` 能力（对外方法名仍为 `preload`；Creator 3.8.8 引擎侧对应 `assetManager.preloadAny`）。
- `public` 类型允许使用 `import type { Asset, AssetManager } from 'cc'`（减少无意义类型体操；实现侧可 `import` 运行时对象）。

### 2.2 非目标（MVP 不做）

- Remote Bundle 下载、版本差分、热更新流程、下载队列治理（仅保留扩展点）。
- 资源打包/Addressable 式寻址系统（UUID 规则、路径规范由业务与 Creator 工程约束）。
- 与 `FrameworkBootstrap` 强耦合：MVP 不要求启动链路自动注册 `ResService`（可作为接入示例与后续增强）。

## 3. 依赖边界（必须遵守）

对齐仓库分层规则：

- `res` 允许依赖：`base`、`utils`，以及 `cc`（引擎）。
- `base` **禁止**依赖 `res`。
- `utils` **禁止**依赖 `res`。

`res` 对外导出统一走 `assets/framework/res/index.ts`（barrel）。

## 4. 总体架构（MVP）

### 4.1 组件

- **`ResService`**
  - 持有 `AssetManager` 引用（默认 `assetManager`）。
  - 负责创建 `ResScope`。
- **`ResScope`**
  - 提供 `loadAny` / `preload`（MVP）。
  - 维护本 scope 的加载记账，用于 `dispose()` 配对释放。

### 4.2 为什么不把 `releaseAll` 作为 MVP 主路径

`assetManager.releaseAll` 影响面过大，容易与多业务并存冲突；MVP 以 **scope 边界** 管理资源更安全。

> 后续如需“切场景/关游戏”级别的释放策略，应单独设计（例如显式 `ResService.resetForSceneChange()`），不在本 MVP 范围强制定义。

## 5. 公共 API（MVP，命名可微调但语义需一致）

> 说明：以下接口为 **设计契约**；落地时允许微调命名，但不得改变语义（尤其是 scope 释放与 preload 策略）。

### 5.1 `ResService`

- `createResService(am?: AssetManager): ResService`
  - 默认 `am = assetManager`（来自 `cc`）。
- `openScope(): ResScope`
  - 每个 scope 独立记账；互不干扰。

### 5.2 `ResScope`

- `loadAny<T extends Asset>(...args: /* 实现阶段与引擎 `assetManager.loadAny` 保持同名同结构 */): Promise<T>`
  - **成功 resolve 后**：必须把返回的 `Asset` 纳入本 scope 的释放记账。
  - **reject**：不记账（不释放）。
- `preload(...args: /* 实现阶段与引擎 `assetManager.preloadAny` 保持同名同结构 */): Promise<void>`
  - **默认不纳入** scope 的自动释放记账（见 6.3）。
- `dispose(): void`
  - **幂等**：重复调用无副作用。
  - 释放顺序：建议按“后加载先释放”或“稳定顺序释放”二选一写死实现（spec 不强制，但实现必须固定一种并在代码注释说明）。

## 6. 关键语义（必须写死，避免误用）

### 6.1 `loadAny` 的记账规则（引用计数配对）

Cocos 的资源系统对同一资源可能存在引用计数语义（同一 `Asset` 实例多次加载会增加引用）。

因此 `ResScope` 必须按 **“成功加载次数”** 记账，而不是按“唯一 Asset 记 1 次”：

- 维护 `Map<Asset, number>`（或等价结构）作为 `acquireCount`。
- 每次 `loadAny` 成功返回 `asset`：`acquireCount(asset) += 1`。
- `dispose()`：对每个 `asset` 调用 `releaseAsset(asset)` **次数 = acquireCount(asset)**，然后清空。

> 备注：若未来发现某些资源类型需要不同释放路径，应新增显式 API，而不是偷偷改变 `releaseAsset` 次数。

### 6.2 `dispose` 与并发加载

允许同一 scope 并发发起多次 `loadAny`：

- 记账必须在 **成功返回** 后递增。
- `dispose()` 必须等待所有未完成的加载吗？**MVP 不强制 await**：  
  - 若 `dispose()` 发生时仍有未完成 Promise：实现可选择：
    - **A（推荐）**：`dispose()` 标记 scope 为 closed；后续 `loadAny/preload` 直接 reject；已完成的仍按规则释放；未完成的在完成后不再记账（避免泄漏与双重释放的竞态）。
    - **B**：返回 `disposeAsync()`（不在 MVP 公共面引入，除非实现证明必要）。

### 6.3 `preload` 策略（MVP）

默认策略：

- `preload(...)` **不纳入** `ResScope` 的自动释放记账。

原因：`preload` 的完成形态在不同资源类型/引擎版本下，未必总能稳定映射到可 `releaseAsset` 的 `Asset` 句柄；把它强行纳入 scope，容易出现“释放了仍在用的缓存”或“无法配对”的灰色地带。

若未来需要：

- 增加 `preloadTracked(...)` 或 `openPreloadScope()` 作为独立能力（新 spec 再定）。

### 6.4 `import` / `import type` 边界

- `public` API 允许 `import type { Asset, AssetManager } from 'cc'`。
- 运行时从 `cc` 获取 `assetManager` 的实现细节必须收敛在 `res` 模块内部文件（避免业务散落 `import { assetManager }` 与框架策略分叉）。

## 7. 错误模型（MVP）

- `loadAny/preload`：Promise **reject**；错误对象应保留引擎原始信息（message/stack），允许额外包装一层框架错误类型（可选）。
- `dispose()`：不应吞掉 `releaseAsset` 抛错；策略二选一写死实现：
  - **推荐**：记录 first error，继续尝试释放其余资源，最后汇总抛出 AggregateError（若 TS/运行环境不便，可退化为“第一个错误抛出”，但必须在注释说明）。

## 8. 扩展点：Bundle / Remote（非 MVP）

仅定义接口与里程碑，不在 MVP 实现：

- `ResBundlesGateway`（命名可调整）：
  - `loadBundle(nameOrUrl: string, options?: /* 对齐引擎 */): Promise<Bundle>`
  - `getBundle(name: string): Bundle | null`（对齐 `assetManager.getBundle`）
- Remote 相关：
  - 下载器策略、`bundleVers`、`downloader.maxConcurrency` 等，统一归入 `ResRemotePolicy`（后续 spec）。

## 9. 测试策略（Vitest）

- 使用 **注入** 的 fake `AssetManager`（最小 mock：记录 `loadAny/preload/releaseAsset` 调用次数）。
- 覆盖：
  - 同 asset 多次 `loadAny` 成功后的 `dispose` 释放次数是否正确
  - `dispose` 幂等
  - `preload` 默认不触发 `releaseAsset`（除非 mock 证明引擎路径会走 release——若出现则调整实现与 spec）

## 10. 验收标准（MVP）

- `@fw/res` 提供 `createResService` 与 `openScope`，默认可对接全局 `assetManager`。
- `ResScope.loadAny` 成功路径可配对 `releaseAsset`，且支持同一 `Asset` 多次加载的计数释放。
- `preload` 默认不纳入 scope 自动释放（行为与文档一致）。
- `res` 不引入对 `base` 的反向依赖；不破坏现有分层规则。
- Vitest 具备对记账/释放逻辑的可测性（通过注入 `AssetManager`）。

## 11. 与引擎 API 的对齐方式（实现阶段约束）

- MVP 以 `cc.assetManager.loadAny / preloadAny / releaseAsset` 为对齐对象；其中 `loadAny` 在引擎类型上可能表现为回调式重载，实现层需 Promise 化，但对外仍保持 `Promise` API；参数签名随 Creator 3.8.8 的类型定义走。
- 若未来升级 Creator 版本：优先保持 `ResService/ResScope` 的 **语义稳定**，必要时在实现层适配签名变化，并补充变更记录。
