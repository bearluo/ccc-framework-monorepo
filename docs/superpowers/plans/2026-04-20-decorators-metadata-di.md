# Decorators 元数据 + `registerDecoratedServices` Implementation Plan

> **状态：** 对应实现已从代码库 **回滚**；本计划文件保留作记录，**勿按本文直接执行**。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `@fw/base/decorators` 的 `@Service({ registerAs })`、`@Inject(token)` 元数据登记，以及 `registerDecoratedServices(container)` 向 `Container` 注册 `registerSingleton` 并在首次 `resolve` 时完成 **无参构造 + 属性注入**；为 `Container` 增加 **`has(token)`**。

**Architecture:** 模块内维护 **有序服务列表** 与 **`WeakMap<Constructor, Map<PropertyKey, Token>>`** 的注入表；装饰器仅写元数据；`registerDecoratedServices` 遍历列表并注册工厂（工厂内 `resolve` 依赖）。Vitest 用 **`resetDecoratedMetadataForTests()`** 隔离全局登记（仅测试文档说明）。

**Tech Stack:** TypeScript、`experimentalDecorators`（与仓库 `tsconfig` 一致）、Vitest、现有 `Container` / `Token`。

**Spec 来源:** `docs/superpowers/specs/2026-04-20-decorators-metadata-di-design.md`

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `assets/framework/base/di/index.ts` | 新增 `has(token): boolean` |
| `assets/framework/base/decorators/metadata-registry.ts` | 有序 `serviceEntries`、`seenCtors`、`injectMap`、`recordService`、`recordInject`、`getDecoratedServiceEntries`、`resetDecoratedMetadataForTests` |
| `assets/framework/base/decorators/register-decorated-services.ts` | `registerDecoratedServices(container)` |
| `assets/framework/base/decorators/index.ts` | 导出 `Service`、`Inject`、`ServiceOptions`、`registerDecoratedServices`、`getDecoratedServiceEntries`、`resetDecoratedMetadataForTests`（后者带 `@internal` 注释） |
| `tests/base.di.test.ts` | 断言 `has` |
| `tests/base.decorators.test.ts` | 元数据、集成、失败路径；`afterEach` 调 `resetDecoratedMetadataForTests` |
| `docs/architecture/ccc-framework.md` | 更新 `Decorators` 小节「当前 public 形态」与 spec 一致 |

---

### Task 1: `Container.has`

**Files:**

- Modify: `assets/framework/base/di/index.ts`
- Modify: `tests/base.di.test.ts`

- [ ] **Step 1: 在 `Container` 上增加 `has`**

```typescript
has<T>(token: Token<T>): boolean {
    return this.providers.has(token);
}
```

- [ ] **Step 2: 在 `base.di.test.ts` 增加用例**

```typescript
it('has returns false before register and true after', () => {
    const c = new Container();
    const T = createToken<number>('n');
    expect(c.has(T)).toBe(false);
    c.register(T, () => 1);
    expect(c.has(T)).toBe(true);
});
```

- [ ] **Step 3: 运行**

Run: `npm test -- tests/base.di.test.ts`

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add assets/framework/base/di/index.ts tests/base.di.test.ts
git commit -m "feat(di): Container 增加 has(token)"
```

---

### Task 2: 元数据登记模块

**Files:**

- Create: `assets/framework/base/decorators/metadata-registry.ts`

- [ ] **Step 1: 实现登记与查询（完整文件）**

```typescript
import type { Token } from '@fw/base/di';

export type AnyConstructor = new (...args: unknown[]) => unknown;

export type DecoratedServiceEntry = { ctor: AnyConstructor; registerAs: Token<unknown> };

const seenServiceCtors = new Set<AnyConstructor>();
const serviceEntries: DecoratedServiceEntry[] = [];

let injectByCtor = new WeakMap<AnyConstructor, Map<PropertyKey, Token<unknown>>>();

export function recordService(ctor: AnyConstructor, registerAs: Token<unknown>): void {
    if (seenServiceCtors.has(ctor)) {
        return;
    }
    seenServiceCtors.add(ctor);
    serviceEntries.push({ ctor, registerAs });
}

export function recordInject(ctor: AnyConstructor, propertyKey: PropertyKey, token: Token<unknown>): void {
    let map = injectByCtor.get(ctor);
    if (!map) {
        map = new Map();
        injectByCtor.set(ctor, map);
    }
    map.set(propertyKey, token);
}

export function getInjectionsForCtor(ctor: AnyConstructor): ReadonlyMap<PropertyKey, Token<unknown>> | undefined {
    return injectByCtor.get(ctor);
}

export function getDecoratedServiceEntries(): ReadonlyArray<DecoratedServiceEntry> {
    return [...serviceEntries];
}

/** 仅测试隔离：清空登记（非生产 API）。 */
export function resetDecoratedMetadataForTests(): void {
    seenServiceCtors.clear();
    serviceEntries.length = 0;
    injectByCtor = new WeakMap();
}
```

- [ ] **Step 2: 自检 `recordService` 同 ctor 第二次调用不追加**（在 Task 3 测试中覆盖）。

---

### Task 3: `Service` / `Inject` 与 `registerDecoratedServices`

**Files:**

- Create: `assets/framework/base/decorators/register-decorated-services.ts`
- Modify: `assets/framework/base/decorators/index.ts`（替换桩实现）

- [ ] **Step 1: `register-decorated-services.ts`**

```typescript
import type { Container } from '@fw/base/di';
import {
    getDecoratedServiceEntries,
    getInjectionsForCtor,
    type AnyConstructor,
} from './metadata-registry';

export function registerDecoratedServices(container: Container): void {
    for (const { ctor, registerAs } of getDecoratedServiceEntries()) {
        if (container.has(registerAs)) {
            throw new Error(`registerDecoratedServices: token already registered: ${String(registerAs)}`);
        }
        container.registerSingleton(registerAs, () => {
            const instance = new (ctor as new () => unknown)();
            const props = getInjectionsForCtor(ctor);
            if (props) {
                for (const [key, tok] of props) {
                    (instance as Record<PropertyKey, unknown>)[key] = container.resolve(tok);
                }
            }
            return instance;
        });
    }
}
```

- [ ] **Step 2: `index.ts` 导出装饰器与类型**

```typescript
import type { ClassDecorator } from 'cc'; // 若无全局 ClassDecorator，用 `import type` 从辅助类型或手写
```

**说明：** 若项目无 `ClassDecorator` 全局类型，使用：

```typescript
type ClassDecorator = <T extends AnyConstructor>(target: T) => T | void;
```

从 `metadata-registry` 导入 `AnyConstructor`。

`ServiceOptions` 与 `Service`：

```typescript
import type { Token } from '@fw/base/di';
import { recordService, recordInject, type AnyConstructor } from './metadata-registry';
import { registerDecoratedServices } from './register-decorated-services';

export type ServiceOptions<T> = { registerAs: Token<T> };

export function Service<T>(options: ServiceOptions<T>): ClassDecorator {
    return <C extends new (...args: unknown[]) => T>(ctor: C) => {
        recordService(ctor as unknown as AnyConstructor, options.registerAs as Token<unknown>);
        return ctor;
    };
}

export function Inject<T>(token: Token<T>): PropertyDecorator {
    return (target: object, propertyKey: PropertyKey | undefined) => {
        if (propertyKey === undefined) {
            return;
        }
        if (typeof target === 'function') {
            throw new Error('@Inject: static members are not supported in this version');
        }
        const ctor = (target as { constructor: AnyConstructor }).constructor;
        recordInject(ctor, propertyKey, token as Token<unknown>);
    };
}
```

- [ ] **Step 3: 从 `index.ts` 再导出** `registerDecoratedServices`、`getDecoratedServiceEntries`、`resetDecoratedMetadataForTests`、`DecoratedServiceEntry`（类型从 registry 重导出）。

- [ ] **Step 4: 确认 `base/index.ts`** 仍 `export * as decorators from '@fw/base/decorators'`，无需改。

---

### Task 4: Vitest — `base.decorators.test.ts`

**Files:**

- Modify: `tests/base.decorators.test.ts`

- [ ] **Step 1: 每个用例前/后 `resetDecoratedMetadataForTests`**

```typescript
import { afterEach, describe, expect, it } from 'vitest';
import { Container, createToken } from '@fw/base/di';
import {
    Inject,
    Service,
    getDecoratedServiceEntries,
    registerDecoratedServices,
    resetDecoratedMetadataForTests,
} from '@fw/base/decorators';

afterEach(() => {
    resetDecoratedMetadataForTests();
});
```

- [ ] **Step 2: 用例「元数据 + 注入」**（在 `it` 内声明类，避免模块级污染）

```typescript
it('registerDecoratedServices 注入属性', () => {
    const TB = createToken<{ v: number }>('B');
    const TA = createToken<{ b: { v: number } }>('A');

    @Service({ registerAs: TA })
    class A {
        @Inject(TB)
        b!: { v: number };
    }

    @Service({ registerAs: TB })
    class B {
        v = 7;
    }

    const c = new Container();
    registerDecoratedServices(c);
    const a = c.resolve(TA);
    expect(a.b.v).toBe(7);
});
```

**注意：** 上例中 `B` 也 `@Service` 才会进入列表；`A` 的工厂 `resolve(TB)` 会触发 `B` 的构造。注册顺序：先 `A` 后 `B` 时首次 `resolve(TA)` 需 `TB` 已注册——**注册顺序** 为 `getDecoratedServiceEntries` 顺序；若 `A` 先于 `B` 登记，`registerSingleton` 都已注册，**惰性** OK。若测试里 **类声明顺序** 为 `A` 再 `B`，entries 顺序为 `[A,B]`，工厂尚未 resolve 时两者都已 register，OK。

- [ ] **Step 3: 用例「重复 registerAs throw」**

先 `registerDecoratedServices` 一次，再 `new Container()` 同结构或手动 `c.registerSingleton(TA,...)` 后第二次 `registerDecoratedServices`——更简单：**同一 `container` 连续两次** `registerDecoratedServices` 应第二次 **throw**（第一次已 `has(TA)`）。

```typescript
it('重复 registerDecoratedServices 对已含 token 的 container 抛错', () => {
    const T = createToken<unknown>('x');
    @Service({ registerAs: T })
    class X {}
    const c = new Container();
    registerDecoratedServices(c);
    expect(() => registerDecoratedServices(c)).toThrow(/already registered/);
});
```

第二次调用时 `getDecoratedServiceEntries` 仍含 `X`，遍历第一个 `registerAs` 时 `has` 为 true → throw。符合 spec。

- [ ] **Step 4: 用例「仅 Inject 无 Service 不装配」**（可选）：类仅有 `@Inject` 无 `@Service`，`getDecoratedServiceEntries` 为空，`registerDecoratedServices` 不注册；手动 `c.register` 后 `resolve` 得到对象 **无** 自动注入——此用例略弱；可省略或只断言 entries 为空。

- [ ] **Step 5: 运行**

Run: `npm test -- tests/base.decorators.test.ts`

Expected: PASS

---

### Task 5: 架构文档与全量校验

**Files:**

- Modify: `docs/architecture/ccc-framework.md`（`Decorators` 小节）

- [ ] **Step 1: 将「当前 public 形态」更新为**：`Service(options)`、`Inject(token)`（实例属性；静态抛错）、`registerDecoratedServices(container)`、`getDecoratedServiceEntries()`、`resetDecoratedMetadataForTests()`（测试用）。

- [ ] **Step 2:**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: 全部 PASS

- [ ] **Step 3: 提交**

```bash
git add assets/framework/base/decorators assets/framework/base/di/index.ts tests/base.decorators.test.ts tests/base.di.test.ts docs/architecture/ccc-framework.md
git commit -m "feat(base): decorators 元数据与 registerDecoratedServices"
```

---

## Plan 自检（对照 spec）

| Spec § | 任务 |
|--------|------|
| 1.1 `@Service` + 有序去重 | Task 2 `recordService` |
| 1.2 `@Inject` 实例、无 Service 不装配 | Task 3 `Inject` + factory 仅对已登记 ctor 读 inject |
| 1.3 `getDecoratedServiceEntries` | Task 2 |
| 2.1 `has` + `registerSingleton` + 属性 `resolve` | Task 1 + Task 3 |
| 2.2 重复调用 throw | Task 4 测试 |
| 5 测试策略 | Task 4 |
| `Container.has` | Task 1 |

**占位符扫描：** 无 TBD。

**类型注意：** `Service` 的 `ClassDecorator` 泛型与 `experimentalDecorators` 返回值；若 `strict` 报错，对 `ctor` 使用受控断言并保持运行行为不变。

---

## Execution Handoff

**Plan 已保存至 `docs/superpowers/plans/2026-04-20-decorators-metadata-di.md`。**

1. **Subagent-Driven（推荐）** — 每 Task 子代理 + 双审。  
2. **Inline Execution** — 本会话按 Task 顺序实现。

**请选择 1 或 2；若未指定，默认按 Inline 在本仓库执行实现。**
