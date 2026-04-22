# game-template：子游戏入口

1. 在首场景根节点添加组件 `SubgameRoot`（脚本：`assets/scripts/SubgameRoot.ts`）。
2. Host 在 `director.runScene` 前必须调用 `setPendingSubgameMount({ hostContext, launchParams })`。
3. 子游戏与 Host 交互：使用 `consumePendingSubgameMount()` 返回的 `hostContext`（示例里先保留 `void payload.hostContext`，接入业务时改为真实调用）。
