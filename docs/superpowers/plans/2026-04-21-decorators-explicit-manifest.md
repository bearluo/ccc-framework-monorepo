# Decorators 显式清单 + 多 `Container` Implementation Plan

> **状态：** 已在仓库实现（提交 `fa1af27` 一带；后续以代码为准）。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-04-21-decorators-explicit-manifest-design.md` 实现 **`@Service({ registerAs })` / `@Inject`** 元数据（挂 ctor）与 **`registerDecoratedServices(container, classes)`**；**无**模块级服务队列、**不**加 `Container.has`。

**Architecture:** 使用 **`Symbol.for('fw.decorators')`** 在 ctor 上挂聚合对象 `{ service?: { registerAs }; props?: Map; ctorParams?: Map }`**；`registerDecoratedServices` 仅遍历入参 **`classes`**，校验重复 ctor、缺 `@Service` 即 `throw`；工厂内构造注入 → `new` → 属性注入。

**Tech Stack:** TypeScript、`experimentalDecorators`、`Vitest`、现有 `Container`。

**Spec 来源:** `docs/superpowers/specs/2026-04-21-decorators-explicit-manifest-design.md`

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `assets/framework/base/decorators/decorator-meta.ts` | `META` 常量、`AnyConstructor`、`DecoratorMeta`、读写 `getOrInitMeta` / `readServiceRegisterAs` / `readPropInjects` / `readCtorParamInjects` |
| `assets/framework/base/decorators/register-decorated-services.ts` | `registerDecoratedServices(container, classes)` |
| `assets/framework/base/decorators/index.ts` | `Service`、`Inject`、`ServiceOptions`、`registerDecoratedServices` 导出 |
| `tests/base.decorators.test.ts` | §5 策略：双 `Container`、清单错误、构造/属性注入、方法参数 throw |
| `docs/architecture/ccc-framework.md` | `Decorators` 小节更新为「已实现」形态（`registerDecoratedServices(container, classes)`） |

---

### Task 1: `decorator-meta.ts`

**Files:**

- Create: `assets/framework/base/decorators/decorator-meta.ts`

- [ ] **Step 1: 写入下列实现（可微调命名，语义不变）**

```typescript
import type { Token } from '@fw/base/di';

export type AnyConstructor = new (...args: unknown[]) => unknown;

export const FW_DECORATORS_META = Symbol.for('fw.decorators');

export type ServiceMeta = { registerAs: Token<unknown> };

export type DecoratorMeta = {
    service?: ServiceMeta;
    props?: Map<PropertyKey, Token<unknown>>;
    ctorParams?: Map<number, Token<unknown>>;
};

function metaBag(ctor: AnyConstructor): Record<symbol, unknown> {
    return ctor as unknown as Record<symbol, unknown>;
}

export function readDecoratorMeta(ctor: AnyConstructor): DecoratorMeta | undefined {
    return metaBag(ctor)[FW_DECORATORS_META] as DecoratorMeta | undefined;
}

export function getOrInitMeta(ctor: AnyConstructor): DecoratorMeta {
    const bag = metaBag(ctor);
    let m = bag[FW_DECORATORS_META] as DecoratorMeta | undefined;
    if (!m) {
        m = {};
        bag[FW_DECORATORS_META] = m;
    }
    return m;
}

export function readServiceMeta(ctor: AnyConstructor): ServiceMeta | undefined {
    return readDecoratorMeta(ctor)?.service;
}
```

**实现要点：** **`getOrInitMeta`** 仅由 `Service` / `Inject` 调用；装配路径只用 **`readDecoratorMeta` / `readServiceMeta`**。

- [ ] **Step 2: 提交（可与 Task 3 合并为一次 commit）**

---

### Task 2: `registerDecoratedServices(container, classes)`

**Files:**

- Create: `assets/framework/base/decorators/register-decorated-services.ts`

- [ ] **Step 1: 实现清单校验 + 工厂**

```typescript
import type { Container } from '@fw/base/di';
import { readDecoratorMeta, readServiceMeta, type AnyConstructor } from './decorator-meta';

function assertUniqueClasses(classes: readonly AnyConstructor[]): void {
    const seen = new Set<AnyConstructor>();
    for (const c of classes) {
        if (seen.has(c)) {
            throw new Error('registerDecoratedServices: duplicate constructor in classes');
        }
        seen.add(c);
    }
}

function createInstance(container: Container, ctor: AnyConstructor): unknown {
    const meta = readDecoratorMeta(ctor);
    if (!meta) throw new Error('registerDecoratedServices: internal missing meta');
    const ctorParams = meta.ctorParams;
    let instance: unknown;
    if (ctorParams && ctorParams.size > 0) {
        const max = Math.max(...ctorParams.keys());
        const args: unknown[] = [];
        for (let i = 0; i <= max; i++) {
            const tok = ctorParams.get(i);
            args.push(tok !== undefined ? container.resolve(tok) : undefined);
        }
        instance = new (ctor as new (...args: unknown[]) => unknown)(...args);
    } else {
        instance = new (ctor as new () => unknown)();
    }
    if (meta.props) {
        const obj = instance as Record<PropertyKey, unknown>;
        for (const [k, tok] of meta.props) {
            obj[k] = container.resolve(tok);
        }
    }
    return instance;
}

export function registerDecoratedServices(container: Container, classes: readonly AnyConstructor[]): void {
    assertUniqueClasses(classes);
    for (const ctor of classes) {
        const svc = readServiceMeta(ctor);
        if (!svc) {
            throw new Error(`registerDecoratedServices: missing @Service on ${ctor.name}`);
        }
        const { registerAs } = svc;
        container.registerSingleton(registerAs, () => createInstance(container, ctor));
    }
}
```

**注意：** `getOrInitMeta` 在「只读」路径不应创建空 meta 以免污染；装配时应使用 **`readServiceMeta`** + 若需 props 则从 **`(ctor as any)[FW_DECORATORS_META]`** 只读；上面片段中 `createInstance` 应改为读取已存在 meta（实现 Task 1 时提供 `readDecoratorMeta(ctor): DecoratorMeta | undefined` 更安全）。

---

### Task 3: `index.ts` — `Service` / `Inject`

**Files:**

- Modify: `assets/framework/base/decorators/index.ts`

- [ ] **Step 1: `Service` / `Inject`**

```typescript
import type { Token } from '@fw/base/di';
import { getOrInitMeta, type AnyConstructor } from './decorator-meta';
import { registerDecoratedServices } from './register-decorated-services';

export type ServiceOptions<T> = { registerAs: Token<T> };

export function Service<T>(options: ServiceOptions<T>) {
    return <C extends AnyConstructor>(ctor: C): C => {
        const m = getOrInitMeta(ctor);
        m.service = { registerAs: options.registerAs as Token<unknown> };
        return ctor;
    };
}

export function Inject<T>(token: Token<T>): PropertyDecorator & ParameterDecorator {
    return ((target: object, propertyKey: string | symbol | undefined, parameterIndex?: unknown) => {
        if (typeof parameterIndex === 'number') {
            if (propertyKey !== undefined) {
                throw new Error('@Inject: method parameters are not supported');
            }
            const ctor = target as AnyConstructor;
            const m = getOrInitMeta(ctor);
            if (!m.ctorParams) m.ctorParams = new Map();
            m.ctorParams.set(parameterIndex, token as Token<unknown>);
            return;
        }
        if (propertyKey === undefined) return;
        if (typeof target === 'function') {
            throw new Error('@Inject: static members are not supported');
        }
        const ctor = (target as { constructor: AnyConstructor }).constructor;
        const m = getOrInitMeta(ctor);
        if (!m.props) m.props = new Map();
        m.props.set(propertyKey, token as Token<unknown>);
    }) as PropertyDecorator & ParameterDecorator;
}

export { registerDecoratedServices } from './register-decorated-services';
export type { AnyConstructor } from './decorator-meta';
export { FW_DECORATORS_META } from './decorator-meta';
```

- [ ] **Step 2: 确认 `base/index.ts` 仍 `export * as decorators`**，无需改。

---

### Task 4: Vitest `tests/base.decorators.test.ts`

**Files:**

- Modify: `tests/base.decorators.test.ts`

- [ ] **Step 1: 覆盖用例**

1. `双 Container`：`registerDecoratedServices(c1, [X])`、`registerDecoratedServices(c2, [X])`，`c1.resolve(T) !== c2.resolve(T)`。  
2. `classes` 重复：`registerDecoratedServices(c, [X, X])` **throw**。  
3. 无 `@Service`：`registerDecoratedServices(c, [Plain])` **throw**。  
4. 属性注入 + 构造注入（各一 `it`，类定义在 `it` 内）。  
5. 方法参数 `@Inject`：`expect(() => { class M { foo(@Inject(T) _: number) {} } }).toThrow(...)`。

- [ ] **Step 2: `npm test -- tests/base.decorators.test.ts`**

Expected: PASS

---

### Task 5: 架构文档与全量校验

**Files:**

- Modify: `docs/architecture/ccc-framework.md`

- [ ] **Step 1: `Decorators` 小节** 写明：`Service({ registerAs })`、`Inject`（实例属性 + 构造参数）、`registerDecoratedServices(container, classes)`；无全局队列；重复 `registerAs` 依赖 `registerSingleton` 覆盖语义（警告）。

- [ ] **Step 2: `npm run typecheck` && `npm run lint` && `npm test`**

- [ ] **Step 3: 提交**

```bash
git add assets/framework/base/decorators tests/base.decorators.test.ts docs/architecture/ccc-framework.md
git commit -m "feat(base): 显式清单装饰器 DI（多 Container）"
```

---

## Plan 自检（对照 spec）

| Spec § | 任务 |
|--------|------|
| 2 元数据 ctor | Task 1 + Task 3 |
| 3 `registerDecoratedServices` | Task 2 |
| 4 不加 `has` | Task 2 仅用 `registerSingleton` |
| 5 测试 | Task 4 |
| 6 无全局队列 | Task 1 无 service 数组 |

**占位符：** 无 TBD。

**Task 1 与 Task 2 衔接：** 提供 `readDecoratorMeta(ctor): DecoratorMeta | undefined`，装配与 `createInstance` **不得**对无 `@Service` 的 ctor `getOrInitMeta` 写入空壳（避免 `readServiceMeta` 误判）；仅 `Service`/`Inject` 装饰器调用 `getOrInitMeta`。

---

## Execution Handoff

**Plan 已保存至 `docs/superpowers/plans/2026-04-21-decorators-explicit-manifest.md`。**

1. **Subagent-Driven**  
2. **Inline Execution**

未指定时可在本会话按 Task 顺序直接实现。
