# base/decorators：显式清单 + 多 `Container`（多 `Context`）设计

> **实现状态：** 仓库已实现 `registerDecoratedServices(container, classes)` 与 ctor 级元数据（以代码与 `docs/architecture/ccc-framework.md` 为准）。

日期：2026-04-21  
引擎基线：Cocos Creator 3.8.x（`experimentalDecorators` 与仓库 `tsconfig` 一致即可）。  
依赖：`@fw/base/di` 的 `Token`、`Container`、`createToken`。

## 0. 与旧文档的关系

- `docs/superpowers/specs/2026-04-20-decorators-metadata-di-design.md`：**实现已回滚**，保留作「全局队列 + `registerDecoratedServices(container)`」方案的历史记录。
- **本文档** 描述 **下一轮实现** 的契约：**显式类清单**、**无进程级服务队列**、**同一套类元数据可对多个 `Container` 分别装配**（大厅 / 子游戏等多 `Context` 场景）。

## 1. 背景与目标

### 1.1 问题

- 旧方案在模块内维护 **全局有序「已 `@Service` 类」列表**，与 **多 `Context`、多 `Container` 隔离** 冲突；且易与「单进程装配域」心智绑定。
- `Context` 已持有 `container: Container`（`createContext`）；装配应与 **`Container` 实例** 绑定，而非与「隐式全局队列」绑定。

### 1.2 目标（选型 **A：显式清单**）

- **`@Service({ registerAs })` / `@Inject(token)`**：仅写入 **ctor / 类关联** 上的元数据；**不**写入模块级「待注册类数组」。
- **`registerDecoratedServices(container, classes)`**（名称可微调）：
  - **`classes`**：`readonly AnyConstructor[]`（顺序 = 向 `container` 注册 `registerSingleton` 的顺序；实例仍惰性创建）。
  - **仅处理** `classes` 中出现的 ctor；**不在**此 API 外隐式发现其它已装饰类。
- **多 `Context`**：大厅、子游戏各自 `new Container()` 后，各自传入 **自己的 `classes` 列表** 调用装配；**同一套类定义**（同一 ctor）可在不同 `container` 上各注册一次（各自 `resolve` 得各自单例）。

### 1.3 非目标（首版）

- **`AsyncLocalStorage` / 全局「当前 `Container`」**。
- **`Container.has`** 不作为本特性前置条件；重复 `registerAs` 语义见 §4.3。
- **方法参数 `@Inject`**：**throw**（与历史行为一致）。
- **父子 `Container` 链式 `resolve`**：可另立 spec，本文不依赖。

## 2. 元数据模型

### 2.1 存放位置

- 元数据挂在 **类构造函数 `ctor`** 上（推荐 **`Symbol.for('fw.decorators')` 单对象** 聚合，或等价 `WeakMap`；实现阶段二选一，对外不暴露结构细节）。

### 2.2 `@Service(options)`

- **必选**：`options.registerAs: Token<T>`，`T` 与实例类型对齐（类型层约束）。
- **副作用**：在 `ctor` 上写入 **`registerAs`**（及版本戳等实现细节若有）。

### 2.3 `@Inject(token)`

- **构造参数**：`ParameterDecorator` 路径下 **`propertyKey === undefined`** 且存在 **`parameterIndex`** → 记录 **`parameterIndex → Token`**。
- **实例属性**：`PropertyDecorator` → 记录 **`PropertyKey → Token`**（归属 **该属性所属类的 ctor**）。
- **静态属性 / 方法参数**：**`throw`**（首版不支持；错误信息需区分两类）。

## 3. `registerDecoratedServices(container, classes)`

### 3.1 清单规则

- **`classes` 内 ctor 重复**：**`throw`**。
- **`classes` 某项缺少 `@Service` 元数据**：**`throw`**。
- **已装饰 `@Service` 但不在本 `classes` 中**：**不**参与本次装配（符合显式清单）。

### 3.2 装配步骤（对每个 `ctor` 按数组顺序）

1. 读取 `registerAs`；缺失则已在 3.1 失败。
2. **`container.registerSingleton(registerAs, factory)`**。
3. **`factory`**：
   - 若存在 **构造参数** 元数据：对 `0..max(已记录 index)` 每位，`token` 存在则 `container.resolve(token)`，否则 `undefined`；**`new ctor(...args)`**。
   - 否则 **`new ctor()`**。
   - 再遍历 **属性** 元数据：`instance[key] = container.resolve(token)`。
4. 任一步失败：**`throw`**；**不**要求事务式回滚（与旧 spec 一致）。

### 3.3 与 `createContext` 的推荐顺序

- **`new Container()` → `registerDecoratedServices(container, classes)` → `createContext({ container, env, events })`**（推荐）。
- 亦可先 `createContext` 再对 **`ctx.container`** 装配，只要 **`container` 引用不变**。

## 4. `Container` 行为与重复 token

### 4.1 不扩展 `Container` 为前提

- 首版 **不**新增 `has` 等 API；装配仅调用现有 **`registerSingleton` / `resolve`**。

### 4.2 同一 `classes` 内两类映射到同一 `registerAs`

- 属**使用错误**；不在本 API 内做拓扑检测。
- **语义**：以 **`registerSingleton` 后写覆盖前写** 为准（与当前 `Container` 实现一致）；**spec 与架构文档须明确警告**「勿在同一 `container` 上对同一 `registerAs` 注册两个实现类」。

### 4.3 同一 ctor、两个 `container`

- **允许**：分别 `registerDecoratedServices(c1, [X])`、`registerDecoratedServices(c2, [X])`；`c1.resolve(T)` 与 `c2.resolve(T)` 为 **不同实例**（各自单例表）。

## 5. 测试策略（Vitest）

- **双 `Container`**：同一 `@Service` / `@Inject` 元数据的类 `X`，`registerDecoratedServices(c1, [X])` 与 `registerDecoratedServices(c2, [X])`，断言 **`c1.resolve(T) !== c2.resolve(T)`**。
- **清单约束**：`classes` 重复 ctor **throw**；无 `@Service` 的 ctor 入表 **throw**。
- **集成**：构造注入 + 属性注入各一条（可与旧用例等价迁移）。
- **方法参数 `@Inject`**：**throw**（单测一条）。

## 6. 验收标准

- 无模块级「已装饰类全局队列」。
- `registerDecoratedServices(container, classes)` 行为符合 §3；多 `container` 符合 §4.3。
- `Service` / `Inject` 为 **有运行时语义** 的装饰器（非当前占位空实现）。
- Vitest 覆盖 §5 主路径 + 至少一条清单错误路径。

## 7. Spec 自检

- 无 TBD；非目标已列。
- 与选型 A 一致：显式 `classes`，无全局发现。
- 与旧 `2026-04-20` 文档不矛盾：旧为「已回滚的另一条路」；本文为「当前推荐实现契约」。
