# 外部 Bundle（独立 Creator 工程）开发与交付工作流设计

日期：2026-04-20  
引擎基线：Cocos Creator 3.8.8  
适用范围：**bundle 不在同一个工程**（独立 Creator 工程产出 Asset Bundle；宿主工程在运行期动态加载）

## 0. 与框架现状的关系

- 框架 `res` 推荐主路径是 **`assetManager.loadBundle → ResBundleSession → bundle.load*`**（见 `docs/superpowers/specs/2026-04-18-res-bundle-centric-design.md`）。
- `settings/v2/packages/builder.json` 已体现 remote bundle 的偏好（多平台 `isRemote: true` + `merge_dep` 等），与本工作流天然一致。
- 本文档只定义 **开发协作/交付契约**，不强制新增框架代码；宿主侧可直接用现有 `ResService.loadBundle(nameOrUrl)` 加载 URL。

## 1. 目标 / 非目标

### 1.1 目标

- 允许一个或多个独立 Creator 工程（以下称 **Bundle 工程**）独立构建并发布 bundle 产物。
- 宿主工程（以下称 **Host 工程**）可通过 URL/版本清单在运行期加载外部 bundle，并用现有 `ResBundleSession` 统一资源加载/释放语义。
- 明确：
  - 产物契约（路径结构、版本、兼容约束）
  - 日常联调流程（本地/测试/线上）
  - 版本治理与缓存策略

### 1.2 非目标（v1 不做）

- 不在 Host 工程内实现“自动更新器/灰度/断点续传”等完整热更系统。
- 不定义资源共享（跨工程 uuid 复用/直接引用）的复杂协议；外部 bundle 视为自洽黑盒。

## 2. 术语

- **Host 工程**：运行时容器/大厅工程；负责启动、网络、下载策略、动态加载 bundle。
- **Bundle 工程**：独立 Creator 工程；只负责产出一个或多个 Asset Bundle（远程形态）。
- **Bundle 产物**：Creator 构建出的远程 bundle 目录（CDN/HTTP 可直接访问的静态资源）。
- **Manifest**：Host 工程读取的“可加载 bundle 列表”，包含 name→url/version 等信息。

## 3. 推荐交付形态（方案 1：远程产物 + Manifest + 环境覆盖）

### 3.1 产物发布（Bundle 工程 CI）

Bundle 工程在 CI 中完成：

- 选择目标平台（web/native/miniGame…）并按团队约定构建远程 bundle。
- 将产物发布到静态资源服务（CDN/OSS/内网静态站均可）。
- 发布路径必须**版本化**，避免缓存混乱。推荐：
  - `.../<bundleName>/<semver-or-buildId>/...`
  - 或 `.../<bundleName>/<gitSha>/...`

> 强约定：**禁止**使用“同一 URL 覆盖内容但不变更版本”的方式发布（会导致客户端缓存、依赖映射与加载结果不一致）。

### 3.2 Host 工程 Manifest（运行期选择）

Host 工程维护一份环境可切换的 Manifest（可以是文件、配置服务、或构建时注入）。

**最小字段（v1）：**

- `bundles[<name>].baseUrl: string`：传给 `assetManager.loadBundle` 的 URL/路径前缀（可直接为完整 bundle url）。
- `bundles[<name>].version: string`：用于日志、诊断、以及 URL 选择（若 baseUrl 已含版本可重复）。

**示例（TS 常量，推荐用于 Host 工程 dev 联调）：**

```ts
import { validateManifest } from '@fw/res';

export const manifest = validateManifest({
  bundles: {
    // 对 Host 来说，bundleName 需全局唯一且稳定
    gameA: {
      version: 'dev',
      // 默认 baseUrl（通常用于 staging/prod；dev 可用 env 覆盖）
      baseUrl: 'https://cdn.example.com/gameA/1.2.3/',
      env: {
        dev: { baseUrl: 'http://127.0.0.1:8080/gameA/dev/' },
      },
    },
  },
});
```

> 说明：v1 的 env 覆盖只需要 `baseUrl`；其它字段（如 integrity/engineVersion）可以后续扩展，但不应阻塞联调主链路。

**可选字段（v2 预留，不强制实现）：**

- `engineVersion: string`：声明产物引擎版本（例如 `3.8.8`）。
- `integrity`：校验字段（hash/签名），用于防篡改与缓存一致性治理。
- `minHostVersion`：强制宿主最低版本（避免新 bundle 使用宿主不具备的能力）。

### 3.3 环境覆盖（dev / staging / prod）

Manifest 支持按环境覆盖 `baseUrl`：

- **dev**：指向本地静态服务（bundle 工程构建目录），例如 `http://127.0.0.1:xxxx/bundleA/<buildId>/`
- **staging**：指向测试 CDN
- **prod**：指向正式 CDN

Host 工程在启动时决定使用哪套 manifest（环境变量/启动参数/本地开关均可）。

## 4. 兼容性与版本治理（强约定）

### 4.1 引擎版本

强建议 Host 与 Bundle 工程锁定同一 Creator 小版本（例如 3.8.8）。

理由：

- 资源序列化、引擎声明、构建压缩与依赖图细节随版本变化；“能加载”不代表“运行正确”。

最低要求（若不能完全锁定）：

- 在 Manifest/发布说明中声明 `engineVersion`，并维护一个可执行的兼容矩阵（哪些 host 版本允许加载哪些 bundle 版本）。

### 4.2 Bundle 名称与职责边界

- bundle 名称必须稳定且全局唯一（对 host 来说）。
- Bundle 工程内资源引用必须自洽；Host 工程禁止依赖 bundle 内资源的 uuid 或工程路径做“跨工程直连引用”。

### 4.3 缓存策略

- **H5（web）优先采用 Creator 构建选项的 `MD5 Cache`**：让产物文件名/路径携带内容 hash，实现“内容寻址”，从而可放心开启 CDN/浏览器长缓存；更新时因为文件名变化天然绕过缓存。
  - 约定：`baseUrl` 可以保持稳定，但 **产物内引用必须走带 hash 的文件名**（否则仍可能因缓存命中导致加载到旧内容）。
  - 原因：web 侧若改用“版本化 URL（目录）”来做缓存隔离，浏览器/CDN 往往会把它视为一套全新的资源集合，容易导致每次更新退化为“全量重拉”；`MD5 Cache` 更适合让新增/变更文件按需更新。
- **native 优先采用“不同版本 → 不同 URL（目录）”**：发布路径必须版本化（`.../<bundleName>/<version>/...`），Host 侧通过 manifest 切换 `baseUrl` 指向新版本目录。
  - 原因：native 通常由宿主侧的增量更新器自行管理下载/缓存，使用版本化目录能最小化缓存歧义，且不会必然导致“全量更新”（取决于更新器策略）。
- 若业务必须使用固定 URL，则必须引入明确的缓存破坏策略（query + 版本号）并对所有平台一致，但不推荐。

**manifest 与缓存策略落地要点：**

- **web**：推荐 `baseUrl` 指向“逻辑稳定”的 CDN 路径（可不含版本目录），并开启 Creator `MD5 Cache` 让真实文件名携带 hash；这样更新时浏览器/CDN 只会按需拉取变更的 hash 文件。
- **native**：推荐 `baseUrl` 指向“版本化目录”（例如 `.../gameA/1.2.3/`），由增量更新器决定下载粒度；manifest 变更即“切版本”。

## 5. 日常联调流程（推荐 SOP）

### 5.1 Bundle 工程开发者

- 修改资源/场景/脚本（若 bundle 侧含脚本，需确保与 host 的接口协议清晰）。
- 产出远程 bundle（本地构建或 CI 构建）。
- 启动静态服务器托管输出目录（确保 Host 能访问）。

### 5.2 Host 工程开发者

- 切换到 dev manifest（或覆盖某个 bundle 的 baseUrl 为本地地址）。
- 使用 `ResService.loadBundle(nameOrUrl)` 传入 URL，获得 `ResBundleSession` 后再 `load/loadScene`。

> 推荐：Host 侧日志必须打印 bundle 的 name、version 与 baseUrl，便于跨团队定位“你到底加载了哪一版产物”。

## 6. 风险清单（最常见坑）

- **跨工程引用**：Host 若尝试直接引用 bundle 工程资源（uuid/path），会导致协作与版本管理灾难。
- **同名覆盖**：不同团队产出同名 bundle，或同名但职责不同，会造成运行期加载混乱。
- **缓存不一致**：URL 不版本化 + CDN 缓存 + 平台缓存导致“同一用户不同设备/不同时间加载不同内容”。
- **引擎差异**：Host 与 Bundle 工程 Creator 小版本不一致引发的运行期问题。

## 7. 验收标准

- Host 工程无需引入 bundle 产物到仓库，也能在 dev/staging/prod 三种环境下成功加载外部 bundle。
- 通过 Manifest 可明确定位“bundle 版本与来源”。
- 外部 bundle 的加载与资源释放语义仍沿用 `ResBundleSession`（按次 `decRef` + `dispose` 幂等）。

