# res 模块设计（修订）：以 Asset Bundle 为本地资源加载主轴

日期：2026-04-18  
引擎基线：Cocos Creator 3.8.8（`package.json.creator.version`）。  
官方参考：[Asset Manager 概述](https://docs.cocos.com/creator/3.8/manual/zh/asset/asset-manager.html)（动态加载、预加载、Asset Bundle、释放资源等章节）。

## 0. 与既有 spec 的关系

- 本文档 **取代** `docs/superpowers/specs/2026-04-18-res-assetmanager-design.md` 中关于「以 `assetManager.loadAny` 为推荐主路径」的加载模型约定。
- 旧 spec 仍保留作历史记录；其 **会话记账 / dispose 并发 / preload 不自动 release** 等**语义**可复用到新的 `ResBundleSession`，但 **记账触发源** 从 `loadAny` 改为 **`Bundle.load*`**。
- 实现以本文档为准；迁移说明见提交记录与 `docs/superpowers/plans/2026-04-18-res-bundle-centric.md`。

## 1. 背景与问题

官方文档明确：运行期动态加载主要有两条路径——`resources` 目录 + `resources.load*`，或 **将资源制作为 Asset Bundle** 后通过 **`bundle.load*`** 加载；全局入口统一在 **`assetManager`**（见上文官方文档「加载资源」「Asset Bundle」）。

现状框架 `res` 以 `assetManager.loadAny/preloadAny` 为会话入口，**与「本地资源主要依赖 bundle」的工程实践不一致**，也容易绕过 Bundle 边界，导致：

- 业务侧难以自然表达「我在哪个 bundle 里加载」；
- 与官方表格中「单个资源 ↔ Asset Bundle ↔ load/release/preload」的模型对齐成本高。

因此将 **`Bundle` 作为第一公民**：对外推荐路径为 **`assetManager.loadBundle` → `ResBundleSession` → `bundle.load*`**。

## 2. 目标 / 非目标

### 2.1 目标

- **`ResService`**：持有 `AssetManager`（可注入），提供：
  - `getBundle(name: string): Bundle | null`（对齐引擎）
  - `loadBundle(nameOrUrl: string, options?: unknown): Promise<ResBundleSession>`（对齐引擎；实现层 Promise 化）
- **`ResBundleSession`**：绑定单个 **`Bundle` 实例**，提供 Promise 化的 **`load` / `preload`**（实参形态为「`Bundle.load` / `Bundle.preload` 去掉末尾 `onComplete` 后的参数」：实现层用 **`ResBundleLoadArgs` / `ResBundlePreloadArgs`** 等 **联合元组**，中间参类型与 Creator 3.8.8 `cc` 中 `Constructor` / `RequestItem` / 进度回调等对齐，**不**用 `Parameters<Bundle['load']>` 以免重载下只解析到某一签），并对 **`load` 成功返回的 `Asset`** 做 **按次 acquire 记账**；`dispose()` **幂等**，按次数调用 **`Asset.decRef()`** 与官方**引用计数**模型对齐（与 `load` 配对释放；**不**默认使用 `assetManager.releaseAsset`：`release*` 系列会跳过引用检查、强制释放资源本身，见 [Asset Manager 概述](https://docs.cocos.com/creator/3.8/manual/zh/asset/asset-manager.html)「释放资源」与引用计数说明）。
- **内置 `resources` bundle**：与任意自定义 bundle **同一套 API**；通常可通过 `getBundle('resources')` 或 `loadBundle('resources')` 获得会话（以项目构建与引擎行为为准，实现阶段在注释中写死推荐写法）。
- **`preload` / `preloadDir`（若后续暴露）**：默认 **不纳入** `dispose` 的自动 `decRef` 记账（理由同旧 spec：预加载完成形态与可释放句柄不一定一一对应）。

### 2.2 非目标（首版可不实现）

- `cacheManager` 全链路、管线/任务定制（仅保留扩展点描述）。单文件 `loadRemote` 会话见 `2026-04-18-res-remote-session-design.md`，**不**在 `ResBundleSession` 内混装。
- 在 `dispose()` 中默认 **`removeBundle` / 卸载整个 bundle`**（影响面大）；若未来提供，必须是 **显式 API** 并单独定义前置条件与风险。
- 与 `FrameworkBootstrap` / `Context.container` 的强制注册（仍保持弱耦合，接入方自行装配）。

## 3. 依赖边界（不变）

- `res` 可依赖：`base`、`utils`、`cc`。
- `base` 禁止依赖 `res`；`utils` 禁止依赖 `res`。
- 对外 barrel：`assets/framework/res/index.ts`。

## 4. 公共 API（契约）

### 4.1 `createResService(am?: AssetManager): ResService`

- 省略 `am` 时使用全局 `assetManager`（`import { assetManager } from 'cc'` 收敛在实现文件内）。

### 4.2 `ResService`

- `readonly assetManager: AssetManager`
- `getBundle(name: string): Bundle | null`
- `loadBundle(nameOrUrl: string, options?: unknown): Promise<ResBundleSession>`
  - `loadBundle` 失败：Promise reject，不创建 session。
  - `loadBundle` 成功：返回的 `ResBundleSession` **持有** `bundle: Bundle`。

### 4.3 `ResBundleSession`

- `readonly bundle: Bundle`
- `load<T extends Asset>(...args: ResBundleLoadArgs<T>): Promise<T>`（`ResBundleLoadArgs` 为联合元组，与 `Bundle.load` 去掉 `onComplete` 后的各重载一一对应；`type` 位为 `Constructor<T> | null`，`onProgress` 位见 `ResBundleLoadProgress`）
  - 成功 resolve 后：`acquireCount(asset) += 1`
  - reject：不记账
- `preload(...args: ResBundlePreloadArgs): Promise<void>`
  - **默认不记账**
- `dispose(): void`
  - 幂等；对已记账 `Asset` 按次数 `asset.decRef()`
  - `dispose` 过程中 `decRef` 抛错：收集全部错误后抛出一个 `Error`，message 拼接多条子错误（**不使用** `AggregateError`，以兼容 Creator/TS lib 组合）。
- **并发与晚到 resolve**：与旧 spec 6.2-A 一致：`dispose` 置 `closed` 后，新的 `load/preload` reject；已在飞的 `load` 若于 `closed` 之后才 resolve，则 **立刻 `decRef` 一次** 并返回 asset，避免引用泄漏。

### 4.4 对旧 `ResScope`（`assetManager.loadAny`）的处置

- **不再作为推荐 public API**。
- 实现迁移二选一（implementation plan 中择一并写进 CHANGELOG）：
  - **移除** `ResService.openScope` 与 `ResScope` / `ResScopeImpl`；或
  - 保留为 `openAssetManagerSession()` 并标注 **advanced / 非推荐**（YAGNI 倾向 **移除**）。

## 5. Bundle 本体生命周期（写清）

- `ResBundleSession.dispose()` **只**处理本会话内 **`bundle.load` 成功记账的 `Asset`**（通过 **`decRef`** 归还引用）。
- 若业务需要在 session 之外**长期持有**某次 `load` 返回的 `Asset`，应自行按官方文档调用 **`addRef()`**，并承担对应生命周期；本会话 `dispose` 仍会按记账次数 `decRef`，业务需自行 **`addRef`** 平衡，避免误释放。
- **不**在默认 `dispose()` 中调用 `assetManager.removeBundle` 或等价「整包卸载」，除非未来增加显式 `releaseBundleSessionAndRemove(...)` 之类 API 并在 spec 另立章节。

## 6. 与官方文档的对应关系（便于评审）

| 官方概念 | 本设计映射 |
|----------|------------|
| `assetManager.loadBundle` | `ResService.loadBundle` |
| `bundle.load` / `bundle.preload` | `ResBundleSession.load` / `preload` |
| 加载结果缓存于 `assetManager` | 不改变；由引擎管理 |
| 引用计数 `decRef`（与 `load` 配对） | `ResBundleSession.dispose` 内按次 `asset.decRef()` |
| 强制释放 `releaseAsset`（非默认） | 业务在确需「跳过检查、立即释放」时自行调用，不由本会话封装 |
| 内置 `resources` | 作为 bundle 名参与 `getBundle/loadBundle`，无特殊分支逻辑（仅文档推荐用法可区分说明） |

## 7. 扩展点（占位）

- **单文件远程 `loadRemote` 会话**：见 `docs/superpowers/specs/2026-04-18-res-remote-session-design.md`（`ResRemoteSession`，与本文 `ResBundleSession` API 平行）。
- **下载器 / `cacheManager` 全链路 / 远程整包 Asset Bundle**：仍仅描述需求与风险，不在首版实现。
- **`loadDir` / `preloadDir` / `loadScene`**：可按官方表格逐项在后续里程碑加入 `ResBundleSession`；对外仍采用「去掉 `onComplete` 后的 **联合元组**」与现有 `ResBundleLoadArgs` 同构，**不**依赖 `Parameters<Bundle[...]>` 对齐重载。

## 8. 测试策略（Vitest）

- 注入 `FakeAssetManager`：`loadBundle` 返回 `FakeBundle`。
- `FakeBundle.load`：模拟回调式或 Promise 化路径（与实现一致），返回可稳定比较引用相等性的 `Asset` mock。
- 覆盖：同 asset 多次 `load` + `dispose` 的 `decRef` 次数；`dispose` 幂等；`preload` 不触发 `decRef`；晚到 resolve + `dispose` 的 `decRef` 一次。

## 9. 验收标准（本 spec 对应）

- 对外推荐路径为 **`loadBundle` → `ResBundleSession.load/preload` → `dispose`**。
- `resources` bundle 与自定义 bundle 使用同一套 API。
- `dispose` 行为与旧 spec 的「按次配对释放 + 并发/晚到」语义一致：实现上采用 **`decRef` 引用计数**，加载来源为 `Bundle.load`。
- `res` 分层依赖不被破坏；`base` 不依赖 `res`。
- Vitest 可测（注入 `AssetManager` / `Bundle`）。

## 10. 实现阶段约束

- 所有 `Bundle` / `AssetManager` 方法签名以 Creator 3.8.8 类型为准；若引擎 API 为回调式，实现层 Promise 化，但 **对外保持 Promise**。
- 破坏性变更（移除 `openScope` 等）必须在实现 PR/提交说明中显式列出迁移指引：`createResService().loadBundle(...).then(session => session.load(...))`。
