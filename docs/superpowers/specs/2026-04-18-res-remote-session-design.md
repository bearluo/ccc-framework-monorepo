# res 模块设计：`ResRemoteSession`（单文件 `loadRemote` 会话）

日期：2026-04-18  
引擎基线：Cocos Creator 3.8.8（`package.json.creator.version`）。  
官方参考：[Asset Manager 概述](https://docs.cocos.com/creator/3.8/manual/zh/asset/asset-manager.html)（动态加载、`loadRemote`、释放资源、引用计数等章节）。

## 0. 与既有 spec 的关系

- 本文档 **补充** `docs/superpowers/specs/2026-04-18-res-bundle-centric-design.md`：该文档以 **`Bundle.load`** 为本地资源主轴；本文定义 **`assetManager.loadRemote`** 的 **会话式封装**，两者 **API 平行、会计表互不合并**。
- **下载器 / `cacheManager` 全链路 / 远程整包 Asset Bundle**：仍不在本文首版范围；bundle 主轴 spec §7 已说明占位，本文实现后仅将 **「单文件 `loadRemote`」** 从占位中拆出并指向本文。

## 1. 背景与问题

- 运行期除 Bundle 内资源外，常见需求是按 URL **远程拉取** 贴图、音频、二进制等；引擎入口为 **`assetManager.loadRemote`**（回调式、结果进入全局资源缓存与引用计数体系）。
- 与 `ResBundleSession` 相同：业务若只 `loadRemote` 而不在适当时机 **`decRef`**，易造成引用与内存策略不清晰；若误用 **`releaseAsset`** 作为「默认归还」，则与官方「`release*` 跳过引用检查、强制释放」语义不一致。
- 因此提供 **`ResRemoteSession`**：**仅对成功 `load` 的 `Asset` 按次记账**，`dispose` 时按次 **`decRef()`**，并与 bundle 会话对齐 **closed / 晚到 resolve** 规则。

## 2. 目标 / 非目标

### 2.1 目标

- **`ResService`** 增加同步工厂 **`openRemoteSession(): ResRemoteSession`**（不返回 `Promise`；不预发起网络请求）。
- **`ResRemoteSession`**：
  - **`load<T extends Asset>(...args): Promise<T>`**：入参为引擎 **`AssetManager.loadRemote`** 去掉 **最后一个回调参数** 后的参数表（与 Creator 3.8.8 类型一致）；实现层对 `loadRemote` 做 Promise 化，在回调 `err == null` 且拿到 `Asset` 时 **acquire 记账**。
  - **`dispose(): void`**：**幂等**；对已记账 `Asset` 按次数 **`decRef()`**；**不**默认 `releaseAsset`。
  - **并发与晚到 resolve**：与 `ResBundleSession` / bundle 主轴 spec §4.3 一致：`dispose` 置 `closed` 后，新 `load` **reject**；已在飞的 `load` 若于 `closed` **之后**才成功，则 **立刻 `decRef` 一次** 并 **仍 resolve** 该 `Promise`，避免泄漏。
  - **`dispose` 内 `decRef` 抛错**：收集后抛出 **单个 `Error`**（message 拼接），**不使用** `AggregateError`。
- **依赖与导出**：遵守 bundle 主轴 spec §3；`assets/framework/res/index.ts` 并列导出 **`ResRemoteSession`**（及实现类若 barrel 已导出 `ResBundleSessionImpl` 则同策略）。

### 2.2 非目标（首版）

- **内置超时、重试**：不实现；由业务用 `Promise.race`、自写重试等组合 `session.load`。
- **`cacheManager`、下载进度、管线定制、远程整包 Bundle`**：不实现。
- **`ResRemoteSession` 不提供 `preload`**：与引擎「单文件 remote」主路径对齐，首版不造对称 API。
- **`dispose` 中卸载 bundle / `removeBundle`**：不适用。

## 3. 依赖边界

- 与 `docs/superpowers/specs/2026-04-18-res-bundle-centric-design.md` §3 相同：`res` 可依赖 `base`、`utils`、`cc`；`base` / `utils` 禁止依赖 `res`。

## 4. 公共 API（契约）

### 4.1 `ResService`（增量）

- **`openRemoteSession(): ResRemoteSession`**

### 4.2 `ResRemoteSession`

- **`load<T extends Asset>(...args): Promise<T>`**
  - `args`：语义上为引擎 **`loadRemote` 去掉末位 `onComplete` 后的前置参数**。若仓库内 `cc` 声明未收录 `loadRemote`（`Parameters<AssetManager['loadRemote']>` 无法推断），实现可采用 **`[url: string, ...params: unknown[]]`** 以保证可编译；仍须在实现注释中写明与 Creator 3.8.8 行为对齐。
  - 成功 resolve：**`acquireCount(asset) += 1`**。
  - reject：**不**记账。
- **`dispose(): void`**
  - 幂等；按 `acquires` 中次数对每项 **`asset.decRef()`**。

### 4.3 实现类依赖

- **`ResRemoteSessionImpl` 内部持有 `AssetManager`**（由 `ResService` / `ResServiceImpl` 注入）；**对外接口不强制要求** `readonly assetManager`（避免与 `ResService.assetManager` 重复；调试需求可通过 `ResService` 获取）。

## 5. 生命周期与业务约定

- **会话边界**：仅管理本会话内 **`loadRemote` 成功** 的 `Asset`；与 **`ResBundleSession`** 的记账 **不合并**。
- **引用计数与 `addRef`**：与 bundle 主轴 spec §5 相同——若业务需跨会话长期持有，自行 **`addRef()`**；本会话 `dispose` 仍按 acquire 次数 **`decRef`**，须自行平衡次数，避免误释放。
- **`closed` 后新 `load`**：`reject`（例如 `Error: ResRemoteSession disposed`），且会话侧 **不再** 增加 acquire。

## 6. 与官方文档的对应关系

| 官方概念 | 本设计映射 |
|----------|------------|
| `assetManager.loadRemote` | `ResRemoteSession.load`（Promise 化） |
| 引用计数 `decRef`（与会话内成功加载配对） | `ResRemoteSession.dispose` 按次 `decRef()` |
| 强制释放 `releaseAsset` | 业务确需时自行调用；**不**作为会话默认 |
| 超时 / 重试 | 业务自行组合；框架不封装 |

## 7. 测试策略（Vitest）

- 注入 **`FakeAssetManager`**：实现 **`loadRemote`**，根据入参在微任务或 `setTimeout(0)` 调用回调，返回带 **`decRef` / `addRef` spy** 的 mock `Asset`。
- 覆盖：同 asset 多次成功 `load` + `dispose` 的 **`decRef` 次数**；`dispose` 幂等；`load` 失败不增加 dispose 侧义务；**晚到 resolve + `dispose`** 的 **`decRef` 一次**；`dispose` 后新 `load` **reject**。

## 8. 验收标准（本文档对应）

- 存在 **`ResService.openRemoteSession`** 与 **`ResRemoteSession`**，行为符合 §4～§5。
- 默认释放路径为 **`decRef`**，语义与 bundle 会话一致。
- `res` 分层依赖不被破坏；Vitest 可测。

## 9. 实现阶段约束

- `AssetManager.loadRemote` 签名以 Creator 3.8.8 为准；回调式在实现内 Promise 化，**对外仅暴露 `Promise`**。
- 与 `ResBundleSessionImpl` 代码结构允许相似（重复优先于过早抽象）；若后续抽取内部「按 Asset 记账会话」，需单独变更 spec。

## 10. Spec 自检（定稿前核对）

- 无 TBD：首版明确排除超时、重试、cache、远程整包。
- 与 bundle 主轴 spec 无矛盾：双会话并列，dispose 互不干扰。
- 范围单一：仅单文件 `loadRemote` 会话。
- 「晚到仍 resolve」语义明确，避免与「dispose 后一律 reject」混淆（仅 **新发起的 `load`** reject）。
