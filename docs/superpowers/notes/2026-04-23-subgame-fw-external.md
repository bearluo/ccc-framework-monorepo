# 子游戏 remote bundle：@ccc/fw external 约定（实现清单）

目标：子游戏 bundle 内不出现第二份 `@ccc/fw` 运行时实现。

建议路径（按团队工具链二选一）：

1. Creator 自定义构建模板 / bundler external 列表中加入 `@ccc/fw`
2. 子游戏工程通过 import map（Web）或等价机制解析到 Host 已加载模块（需与目标平台一致）

验收：对子游戏 remote bundle 产物做字符串检索，不应包含重复打包的 `fw` 特征路径（按你们 CI 策略定义）。
