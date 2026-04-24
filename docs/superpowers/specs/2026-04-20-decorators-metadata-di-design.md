# base/decorators：元数据 + 显式装配（`Container`）设计

> **状态：** 实现已从仓库 **移除**（`Service`/`Inject` 恢复为占位；`registerDecoratedServices`、`Container.has` 已删）。本文档仅作**设计档案**；若重启该方向可再对照修订。

日期：2026-04-20  
引擎基线：Cocos Creator 3.8.x（`experimentalDecorators` 与仓库 `tsconfig` 一致即可）。  
依赖：`@fw/base/di` 的 `Token`、`Container`、`createToken`。

## 0. 背景与目标

- 现状：`assets/framework/base/decorators/index.ts` 中 **`@Service()`、`@Inject(token)` 为空实现**，与架构文档「注册/注入语义入口」不符。
- 目标（选型 **B**）：装饰器 **只写入元数据**，**不在**装饰器体内或构造函数内隐式 **`container.resolve`**；由启动代码 **显式调用** `registerDecoratedServices(container)`（名称可微调）完成 **`registerSingleton` + 属性注入**。
- **非目标**：`reflect-metadata`、**方法参数**注入、与 Cocos `Component` 生命周期绑定、依赖拓扑排序、`Lazy`/`forwardRef`、注册失败时的「事务式回滚」。

## 1. 元数据模型与发现机制

### 1.1 `@Service(options)`

- **必选**：`options.registerAs: Token<T>`，其中 `T` 与该类实例类型对齐（类型层用泛型约束表达）。
- **副作用**（类定义求值时执行）：
  - 将该 **构造函数** 加入全局 **有序、去重** 列表（重复装饰同一 ctor 不重复插入）。
  - 保存 **`registerAs` ↔ ctor** 的关联（可与列表项合并为 `{ ctor; registerAs }`）。

### 1.2 `@Inject(token)`（首版）

- **实例属性**：`PropertyDecorator`；在 **原型对应类** 上记录 **`PropertyKey` → `Token`**。
- **构造参数**：`ParameterDecorator`；当 **`propertyKey === undefined`** 且存在 **`parameterIndex`** 时，视为 **构造函数注入**，在 **该类构造函数** 上记录 **`parameterIndex` → `Token`**（单独 `WeakMap` 与属性表并列）。
- **方法参数**：若 `parameterIndex` 为数字且 **`propertyKey !== undefined`**，**`throw`**（首版不支持）。
- **副作用**：属性路径使用 `WeakMap<Constructor, Map<PropertyKey, Token>>`；构造参数路径使用 `WeakMap<Constructor, Map<number, Token>>`（或等价）。
- **仅消费「带 `@Service` 的类」上的 `@Inject`**：若某类仅有 `@Inject` 而无 `@Service`，**不**参与 `registerDecoratedServices` 的注册与注入应用（该类上的 `Inject` 元数据可保留但不驱动装配，或实现选择不记录——spec 要求 **装配阶段忽略** 无 `@Service` 的类）。

### 1.3 发现列表

- 依赖 **`@Service()` 的模块副作用**（类被 import 即执行装饰器）；**不**扫描文件系统。
- 导出只读快照供测试/诊断，例如 **`getDecoratedServiceEntries(): ReadonlyArray<{ ctor; registerAs: Token<unknown> }>`**（返回副本）；ABI 稳定性由架构文档标注为「诊断用、破坏性变更可能」。

## 2. `registerDecoratedServices(container)`

### 2.1 行为

1. 按 **1.1 登记顺序** 遍历每个 `{ ctor, registerAs }`。
2. **注册前检测**：若 `container.has(registerAs)` 为 **真**，**`throw`**（避免静默覆盖与双注册语义不清）。  
   - **`Container.has`** 为 **本 spec 对 `base/di` 的增量要求**：`has(token): boolean` 等价于「`providers` Map 中已存在该 symbol」。
3. 调用 **`container.registerSingleton(registerAs, factory)`**，其中 **`factory`**：
   - 若存在 **构造参数** `@Inject` 元数据：对 **`0..max(parameterIndex)`** 每位，有 token 则 **`container.resolve(token)`**，无 token 则 **`undefined`**（用于可选形参）；再 **`new ctor(...args)`**。
   - 否则 **`const instance = new ctor()`**（无参）。
   - 再读取 **属性** `@Inject` 元数据，对每个 `key`：`instance[key] = container.resolve(token)`；
   - `return instance`。
4. 任一步失败（`new` 抛错、`resolve` 无 provider、赋值失败）**立即 `throw`**；**不**保证已注册项回滚（见 §0 非目标）。

### 2.2 幂等与重复调用

- **重复调用** `registerDecoratedServices`：若任一 `registerAs` 已在 `container` 中注册，**`throw`**（依赖 `has`）。

### 2.3 实例化顺序与环依赖

- **`registerSingleton` 惰性**：实例在 **`resolve(registerAs)`** 时创建；**`@Service` 列表顺序** 仅决定 **provider 注册顺序**，**不**保证实例化顺序。
- **属性注入环**（A→B→A）：首版 **不**检测；视为使用错误，可能导致栈溢出或未定义行为；文档与实现计划中加入 **「禁止属性环」** 说明。

## 3. 类型与导出

- **`Service`**：返回标准 `ClassDecorator`；选项类型导出（如 `ServiceOptions<T>`）便于调用方复用。
- **`Inject`**：对外为 **`PropertyDecorator & ParameterDecorator`**；**构造参数**在 `propertyKey === undefined` 时记录；**方法参数**仍 **throw**。
- **`registerDecoratedServices`**：接受 `Container`，返回 `void`。

## 4. 依赖边界

- **`base/decorators` → `base/di`**；**禁止** `di` → `decorators`。
- **`Container.has`** 在 **`assets/framework/base/di/index.ts`** 实现。

## 5. 测试策略（Vitest）

- **元数据**：`@Service` 后 `getDecoratedServiceEntries()` 含预期 `registerAs`；`@Inject` 后装配结果属性非 `undefined`（通过 `registerDecoratedServices` + `resolve` 间接断言）。
- **集成**：两个 Token、类 A 注入 B，`registerDecoratedServices` 后 `resolve(aToken)` 得到 **B 已注入**。
- **失败**：同一 `registerAs` 二次 `registerDecoratedServices` **throw**；或 `resolve` 缺依赖 **throw**（可选一条）。

## 6. 验收标准

- `@Service({ registerAs })` 与 `@Inject(token)` 写入可查询元数据；`registerDecoratedServices` 完成 **singleton 注册 + 属性注入**。
- `Container.has` 存在且行为符合 §2.1。
- 无 `reflect-metadata` 依赖；Vitest 覆盖 §5 主路径与至少一条失败路径。

## 7. Spec 自检

- 无 TBD：构造参数注入、环检测、回滚均为明确非目标。
- 与选型 B 一致：无装饰器内 `resolve`。
- `has` + 重复 `throw` 与当前 `Container.register` 会覆盖的行为对齐，避免静默覆盖。
