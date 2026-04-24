# Creator 单 Bundle 出包 → remote-root 发布 → Manifest 生成（按 bundle 拆分）

**日期**：2026-04-23  
**状态**：已确认的设计规格  
**范围**：面向 Cocos Creator 3.8.x 的“单 bundle 出包”（参考 `build/build-bundle/.../<bundleName>/` 产物），将产物复制到仓库根 `remote-root/` 供 Host 远端加载，并为每个 bundle 生成独立 `manifest.json`（运行时从 remote-root 拉取，不写死 host 工程内 TS 配置）。

---

## 1. 背景与目标

- Creator 项目只能按工程独立打包；目标是让 **Host 在运行时进入“已打包好的子游戏 bundle”**。
- `remote-root` 作为统一静态资源根，由本地 HTTP 服务托管（见已有 remote-root 静态服务规格）。
- **目标**：
  - 每个子游戏 bundle 发布到 `remote-root` 的稳定路径（不引入 `platform/version` 目录层级）。
  - 每个 bundle 目录旁生成一个 `manifest.json`，Host 运行时 fetch 后即可加载该 bundle。
  - 缓存策略不依赖“版本目录”；利用 bundle 内资源文件名自带 hash（如 `index.cc094.js`）实现高效缓存与可更新。

## 2. 非目标

- 不定义 Creator 的构建插件/命令行细节（本规格只定义产物输入/输出与 manifest 格式）。
- 不设计“全量总 manifest”（本规格采用按 bundle 拆分的 manifest）。
- 不解决“跨工程强共享公共 chunk”问题（Creator 仍按工程打包；此规格聚焦 remote bundle 发布与可加载性）。

---

## 3. 产物输入（Creator 单 bundle 出包）

参考目录（示例）：

- `apps/game-template/build/build-bundle/web-desktop/game-template/`

该目录是一个可远端加载的 bundle 单元，典型包含：

- `config.json`
- `index.js` 或 `index.<hash>.js`（例如 `index.cc094.js`）
- `import/**`（场景/资源序列化 json）
- `native/**`（若目标平台产物存在）

> 说明：运行时通过 `assetManager.loadBundle(baseUrl)` 主要加载 bundle 目录下的 `index*.js`，随后按 `config.json` 与 `import/**` 加载场景/资源数据。

---

## 4. 发布输出（remote-root 目录规范）

### 4.1 站点根

`remote-root/` 为站点根，HTTP 访问形态：

`http://<remote-root-host>:<port>/<path-under-remote-root>`

### 4.2 bundle 发布路径（稳定路径）

每个 bundle 发布到：

```
remote-root/
  bundles/
    <bundleName>/
      config.json
      index*.js
      import/** 
      native/** (optional)
      manifest.json
```

其中：

- `<bundleName>`：例如 `game-template`

### 4.3 copy 规则

把 Creator 的单 bundle 产物目录（第 3 节）**整目录原样复制**到 `remote-root/bundles/<bundleName>/` 下（除额外生成 `manifest.json` 外，不改文件内容与层级）。

---

## 5. `manifest.json`（每 bundle 一个）

### 5.1 文件位置

- `remote-root/bundles/<bundleName>/manifest.json`

### 5.2 数据格式

`manifest.json` 是 `@ccc/fw` 的 `BundleManifest` 的 JSON 形态（建议只包含本 bundle 自己）：

```json
{
  "bundles": {
    "<bundleName>": {
      "baseUrl": "bundles/<bundleName>",
      "version": "<version>"
    }
  }
}
```

关键点：

- **`baseUrl`**：相对 remote-root 站点根（已确认）。
- **`version`**：逻辑版本标识，不参与路径拼接，不靠“版本目录”做 cache-bust。

### 5.3 `version` 取值规则（已确认）

从 bundle 目录下入口文件名解析：

- 若存在 `index.<buildId>.js`（例如 `index.cc094.js`），则 `version = <buildId>`（例如 `cc094`）。
- 否则若仅存在 `index.js`，则 `version = "dev"`（默认回退值，便于本地调试）。

---

## 6. Host 运行时加载流程（概念）

### 6.1 远端根地址（Host 可配置）

Host 持有一个可配置的远端根地址：

- `REMOTE_ROOT_BASE = "http://127.0.0.1:8787/"`

### 6.2 加载步骤

1. fetch：`REMOTE_ROOT_BASE + "bundles/<bundleName>/manifest.json"`
2. 解析 JSON，并用 `validateManifest` 校验结构（baseUrl/version 非空）
3. 计算完整 baseUrl：`new URL(entry.baseUrl, REMOTE_ROOT_BASE).toString()`
4. `assetManager.loadBundle(fullBaseUrl)`（或通过 `ResService.loadBundle(fullBaseUrl)`）
5. `bundle.loadScene(...)` → `director.runScene(...)`

> 注意：`manifest.json` 本身不写死域名与端口；环境切换只需更换 `REMOTE_ROOT_BASE`。

---

## 7. 缓存策略（浏览器）

设计原则：**不依赖版本目录；利用带 hash 的文件名做强缓存**。

推荐策略（以 HTTP 响应头为准）：

- **入口/索引类**（可能变更且通常不带 hash）：
  - `config.json`
  - `import/**`
  - `manifest.json`
  - `index.js`（若存在且不带 hash）
  - 建议：`Cache-Control: no-cache`

- **带 hash 文件**：
  - 例如 `index.cc094.js` 或其它带 hash 的脚本/资源
  - 建议：`Cache-Control: public, max-age=31536000, immutable`

> 目的：同路径不必每次重下；只有内容变化导致 hash 变化时才下载新文件。

---

## 8. 自检记录

- `baseUrl`：相对 remote-root 站点根（已确认 A）。
- `version`：从 `index.<buildId>.js` 解析（已确认 A）。
- 不引入 `platform/version` 目录层级；版本仅用于记录与诊断。

