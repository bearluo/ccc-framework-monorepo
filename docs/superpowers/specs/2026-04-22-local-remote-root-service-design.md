# 本地 HTTP Remote 资源服务（`remote-root`）设计

**日期**：2026-04-22  
**状态**：已确认的设计规格  
**范围**：为 Cocos Creator 大厅（`host`）与子游戏（如 `game-template`）在本地调试时，提供 **HTTP 静态资源下载** 能力；各工程构建产物统一输出/拷贝到仓库内 **`remote-root/`** 下，由单一服务托管。

## 1. 背景与目标

- `host` 与 `game-template` 等工程在构建配置中可能将 Asset Bundle 标记为 **remote**（通过 HTTP 拉取）。
- 本地开发需要一个 **可预测的 HTTP 根**，避免把 bundle 混在 `apps/*/build` 内或依赖各工程独立起多个静态服务。
- **目标**：在 monorepo 根提供统一目录 `remote-root/`，并由本地 HTTP 服务将其作为站点根对外提供下载。

## 2. 非目标

- 不规定具体实现语言或框架（Node、Go、nginx 等均可）。
- 不提供鉴权、灰度、动态 manifest API（保持本地调试 YAGNI）；若后续需要，单独开规格。
- 不规定 Creator 打包流水线细节（仅约定产物落盘位置与 URL 映射）。

## 3. 目录约定

在仓库根创建目录：

```
<repo-root>/
  remote-root/
```

**所有**需要被 `host` / 子游戏以 remote 方式拉取的构建产物，应通过构建脚本或手动拷贝，落到 `remote-root/` 之下。

### 3.1 推荐分层（可扩展）

```
remote-root/
  <game>/
    <platform>/
      <version>/
        ...（bundle 与相关静态资源）
```

- **`<game>`**：逻辑游戏标识，例如 `host`、`game-template`、`game-slots`。
- **`<platform>`**：与 Creator 构建目标对齐，例如 `web-desktop`、`android`、`ios`。
- **`<version>`**：版本或环境标识，例如 `dev`、git short SHA、时间戳。

该分层为**推荐约定**，不强制每一层都必须存在；但建议从第一天起按此结构输出，避免后续大规模改 URL。

## 4. HTTP 服务约定

### 4.1 站点根

- 本地 HTTP 服务将 **`remote-root/`** 作为 **HTTP 站点根**（即 URL 路径与 `remote-root` 下相对路径一一对应）。

### 4.2 URL 形态

```
http://127.0.0.1:<port>/<path-under-remote-root>
```

示例（与第 3.1 节分层一致）：

```
http://127.0.0.1:8787/game-template/web-desktop/dev/main/config.json
```

### 4.3 必须能力

- **GET** 静态文件下载。
- 合理的 **`Content-Type`**（至少覆盖 Creator remote 常见类型：`application/json`、`text/javascript`、`application/wasm`、图片与音频等）。

### 4.4 建议能力

- **`Range` 请求**支持（大文件与断点续传更稳）；若实现成本可接受则开启。

### 4.5 CORS（Web 场景）

- 若 `host` 在浏览器中运行且 bundle 域名/端口与页面不同，服务应返回适当的 **`Access-Control-Allow-Origin`**（开发环境可放宽为 `*` 或固定为 `http://localhost:<host-port>`），并允许 **`GET`、`HEAD`**。
- 具体策略由实现阶段按团队安全要求选择；本规格仅要求 **Web 拉 remote 不因 CORS 失败**。

## 5. 与 `host` / manifest 的对接

- `host` 侧 Asset Bundle 的 `baseUrl`（或等价 manifest 字段）应指向 **上述 URL 前缀** 下的某一目录，例如：
  - `http://127.0.0.1:<port>/game-template/web-desktop/dev`
- 若历史 manifest 使用短路径（如 `update`），可在 `remote-root/update/...` 下放置内容，使 `baseUrl` 仍可为 `http://127.0.0.1:<port>/update`；**站点根仍为 `remote-root/`**，只是 URL 第一段为 `update`。

本规格不强制 manifest 字段命名，只要求 **URL 能解析到 `remote-root` 内真实文件**。

## 6. 运维与协作约定

- **`remote-root/` 不应提交大体积二进制**（建议加入 `.gitignore`，或通过 Git LFS / 内部制品库管理）；本规格允许仓库内保留空目录或 `.gitkeep`。
- 各工程 CI/本地脚本负责将构建产物 **同步** 到 `remote-root/<game>/<platform>/<version>/`。
- 端口 `<port>` 建议在根 `package.json` scripts 或文档中固定一个默认值，避免多人冲突。

## 7. 测试与验收

- **冒烟**：对已知路径执行 `curl -I` 或浏览器访问，返回 `200` 且 `Content-Type` 合理。
- **集成**：`host` web 构建在本地启动后，能成功加载至少一个 remote bundle（网络面板无 404/CORS 致命错误）。

## 8. 自检记录（成文时）

- 无 `TBD`。
- 与对话结论一致：**统一根目录名为 `remote-root`**；能力为 **HTTP 静态下载**；推荐 **game/platform/version** 分层。
- 实现细节（选用何种静态服务器、端口、CORS 精确值）留待后续实现计划或工程脚本决定。
