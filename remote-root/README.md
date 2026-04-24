# remote-root（本地 HTTP 远端资源根）

本目录由本地静态服务托管，站点根即本目录。URL：

`http://127.0.0.1:<PORT>/<相对本目录的路径>`

推荐布局：

`remote-root/<game>/<platform>/<version>/...`

示例：将 `game-template` 的 Web remote bundle 放到

`remote-root/game-template/web-desktop/dev/`

则可通过：

`http://127.0.0.1:8787/game-template/web-desktop/dev/<bundle内相对路径>`

启动服务（仓库根）：

`npm run remote:serve`

## 与 host manifest 对齐

若 manifest 中 `baseUrl` 为相对路径 `update`，请把内容放到：

`remote-root/update/`

并把运行时 base 配成：

`http://127.0.0.1:8787/update`

若使用推荐分层，则 `baseUrl` 指向：

`http://127.0.0.1:8787/game-template/web-desktop/dev`

## bundles 发布结构（单 bundle）

发布到：

`remote-root/bundles/<bundleName>/`

并生成：

`remote-root/bundles/<bundleName>/manifest.json`

其中 `baseUrl` 使用相对路径 `bundles/<bundleName>`，`version` 从 `index.<buildId>.js` 解析（如 `cc094`）。
