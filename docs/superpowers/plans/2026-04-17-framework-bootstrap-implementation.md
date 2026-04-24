# FrameworkBootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Cocos Creator 场景中通过挂载 `FrameworkBootstrap` 组件，在 `start()` 自动完成框架最小运行时对象组装并启动（fail-fast 单实例），同时保持 `base/*` 纯 TS、可在 Node/Vitest 下测试 builder 逻辑。

**Architecture:** Creator 绑定代码落在 `assets/framework/ui/bootstrap/FrameworkBootstrap.ts`；纯 TS 组装入口落在 `assets/framework/base/app/builder.ts`，负责构建 `Env/Container/EventBus/Lifecycle/Context/App` 并返回。`FrameworkBootstrap.start()` 负责：单实例检查 → 解析配置 → 调用 builder → 触发生命周期 boot/start 与 `app.start()`。

**Tech Stack:** TypeScript（Creator 3.8.8）、Vitest（纯 TS 单测）、ESLint（模块边界约束）

---

## 文件结构（本计划将创建/修改的文件）

**Create（纯 TS builder）**
- `assets/framework/base/app/builder.ts`

**Create（Creator 启动组件）**
- `assets/framework/ui/bootstrap/FrameworkBootstrap.ts`
- `assets/framework/ui/bootstrap/index.ts`

**Modify（对外导出入口）**
- `assets/framework/base/app/index.ts`
- `assets/framework/ui/index.ts`
- `assets/framework/base/index.ts`（如需补 `app` 子模块导出一致性，通常不需要）

**Modify（demo 验证）**
- `assets/demo/app_scene.ts`

**Test（Vitest）**
- `tests/base.app.builder.test.ts`

---

### Task 1: 定义 builder 的输入/输出类型（纯 TS）

**Files:**
- Create: `assets/framework/base/app/builder.ts`
- Test: `tests/base.app.builder.test.ts`

- [ ] **Step 1: 写失败测试（builder 返回完整 runtime 句柄）**

Create: `tests/base.app.builder.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildApp } from '@fw/base/app/builder';

describe('buildApp', () => {
    it('builds minimal runtime objects', () => {
        const built = buildApp({
            env: { mode: 'dev', platform: 'test', flags: { foo: true } },
        });

        expect(built.app).toBeTruthy();
        expect(built.env.mode).toBe('dev');
        expect(built.env.platform).toBe('test');
        expect(built.env.getFlag?.('foo')).toBe(true);

        expect(built.container).toBeTruthy();
        expect(built.events).toBeTruthy();
        expect(built.lifecycle).toBeTruthy();
        expect(built.context).toBeTruthy();
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- tests/base.app.builder.test.ts
```

Expected: FAIL（提示 `@fw/base/app/builder` 不存在或 `buildApp` 未导出）

- [ ] **Step 3: 写最小实现（只组装，不引入引擎依赖）**

Create: `assets/framework/base/app/builder.ts`

```ts
import { createContext, type Context } from '@fw/base/context';
import { Container } from '@fw/base/di';
import { createEnv, type CreateEnvOptions, type Env } from '@fw/base/env';
import { EventBus, type EventMap } from '@fw/base/event';
import { Lifecycle } from '@fw/base/lifecycle';
import { App } from '@fw/base/app';

export interface BuildAppOptions<Events extends EventMap = any> {
    env: CreateEnvOptions;
    events?: EventBus<Events>;
    container?: Container;
}

export interface BuiltApp<Events extends EventMap = any> {
    app: App;
    env: Env;
    container: Container;
    events: EventBus<Events>;
    lifecycle: Lifecycle;
    context: Context<Events>;
}

export function buildApp<Events extends EventMap = any>(options: BuildAppOptions<Events>): BuiltApp<Events> {
    const env = createEnv(options.env);
    const container = options.container ?? new Container();
    const events = options.events ?? new EventBus<Events>();
    const lifecycle = new Lifecycle();
    const context = createContext({ env, container, events });
    const app = new App({ env, container });

    return { app, env, container, events, lifecycle, context };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test -- tests/base.app.builder.test.ts
```

Expected: PASS（1 file / 1 test）

- [ ] **Step 5: Commit**

```bash
git add assets/framework/base/app/builder.ts tests/base.app.builder.test.ts
git commit -m "feat: add base/app builder for minimal runtime"
```

---

### Task 2: 将 builder 纳入 public API（但不扩大其它层依赖）

**Files:**
- Modify: `assets/framework/base/app/index.ts`

- [ ] **Step 1: 让 app 模块导出 builder**

Update: `assets/framework/base/app/index.ts`

```ts
export * from '@fw/base/app/builder';
export * from '@fw/base/app';
```

> 注意：如果你们希望 `index.ts` 里明确列出 public API，则保持仅导出 `App/AppOptions` 与 `buildApp`；不要导出额外内部符号。

- [ ] **Step 2: typecheck 验证 builder 可被解析**

Run:

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add assets/framework/base/app/index.ts
git commit -m "chore: export buildApp from base/app"
```

---

### Task 3: 新增 Creator 启动组件（FrameworkBootstrap）

**Files:**
- Create: `assets/framework/ui/bootstrap/FrameworkBootstrap.ts`
- Create: `assets/framework/ui/bootstrap/index.ts`
- Modify: `assets/framework/ui/index.ts`

- [ ] **Step 1: 创建 `FrameworkBootstrap` 组件（start 自动启动 + 单实例 fail-fast）**

Create: `assets/framework/ui/bootstrap/FrameworkBootstrap.ts`

```ts
import { _decorator, Component } from 'cc';
import { buildApp } from '@fw/base/app';

const { ccclass, property } = _decorator;

type Mode = 'dev' | 'prod';

let startedBy: FrameworkBootstrap | null = null;

@ccclass('FrameworkBootstrap')
export class FrameworkBootstrap extends Component {
    @property({ tooltip: 'Environment mode' })
    public mode: Mode = 'dev';

    @property({ tooltip: 'Optional platform tag' })
    public platform = '';

    @property({ tooltip: 'Optional JSON for boolean flags, e.g. {\"foo\":true}' })
    public flagsJson = '';

    start(): void {
        if (startedBy && startedBy !== this) {
            const cur = this.node?.name ?? '<unknown>';
            const prev = startedBy.node?.name ?? '<unknown>';
            throw new Error(
                `FrameworkBootstrap duplicated: current="${cur}", startedBy="${prev}". Ensure only one FrameworkBootstrap in scene.`,
            );
        }

        startedBy = this;

        const flags = this.parseFlagsJson(this.flagsJson);
        const built = buildApp({
            env: {
                mode: this.mode,
                platform: this.platform || undefined,
                flags,
            },
        });

        void built.lifecycle.emit('boot');
        built.app.start();
        void built.lifecycle.emit('start');
    }

    private parseFlagsJson(raw: string): Record<string, boolean> | undefined {
        const trimmed = raw.trim();
        if (!trimmed) return undefined;

        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch (e) {
            throw new Error(`Invalid flagsJson: ${String(e)}`);
        }

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Invalid flagsJson: expected object map { [key]: boolean }');
        }

        const out: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v !== 'boolean') {
                throw new Error(`Invalid flagsJson: key "${k}" must be boolean`);
            }
            out[k] = v;
        }

        return out;
    }
}
```

> 说明：`startedBy` 用模块级变量实现“场景单实例”约束。后续如果需要跨场景持久化再单独设计（本计划不做）。

- [ ] **Step 2: 创建 bootstrap barrel**

Create: `assets/framework/ui/bootstrap/index.ts`

```ts
export * from '@fw/ui/bootstrap/FrameworkBootstrap';
```

- [ ] **Step 3: 从 `ui` 层对外导出 bootstrap**

Update: `assets/framework/ui/index.ts`

```ts
export * as bootstrap from '@fw/ui/bootstrap';
```

- [ ] **Step 4: Creator 手工验证（必须）**

在 Creator 中：

- 将 `FrameworkBootstrap` 挂到任意一个 Node
- 配置 `mode/platform/flagsJson`
- Play 运行

Expected:
- 不报错
- 控制台无 “duplicated” 错误

再验证重复启动：
- 再挂一个 `FrameworkBootstrap` 到另一个 Node
- Play 运行

Expected:
- 运行时报错：包含 “FrameworkBootstrap duplicated”

- [ ] **Step 5: Commit**

```bash
git add assets/framework/ui/bootstrap/FrameworkBootstrap.ts assets/framework/ui/bootstrap/index.ts assets/framework/ui/index.ts
git commit -m "feat: add FrameworkBootstrap component for auto startup"
```

---

### Task 4: 更新 demo 场景脚本使用 FrameworkBootstrap（保持最小）

**Files:**
- Modify: `assets/demo/app_scene.ts`

- [ ] **Step 1: 将 demo 从手动 new App 改为说明式（避免重复启动）**

Update: `assets/demo/app_scene.ts`

```ts
import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

@ccclass('app_scene')
export class app_scene extends Component {
    start(): void {
        // 框架启动由 FrameworkBootstrap 组件负责。
        // demo 场景只保留业务脚本入口。
    }
}
```

- [ ] **Step 2: Creator 手工验证**

Expected:
- 场景仍能正常运行
- 启动只发生一次（由 FrameworkBootstrap 触发）

- [ ] **Step 3: Commit**

```bash
git add assets/demo/app_scene.ts
git commit -m "chore: update demo to rely on FrameworkBootstrap"
```

---

### Task 5: 全量验证（工具链）

**Files:**
- (none)

- [ ] **Step 1: typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 2: lint**

Run:

```bash
npm run lint
```

Expected: PASS

- [ ] **Step 3: test**

Run:

```bash
npm test
```

Expected: PASS

---

## 计划自检（对照 spec）

- **Spec coverage**
  - Creator 侧统一入口：Task 3
  - base 纯 TS builder：Task 1-2
  - 单实例 fail-fast：Task 3（duplicated error）
  - 纯 TS 测试：Task 1（Vitest）
- **Placeholder scan**
  - 无 TBD/TODO/“之后再补”式步骤；所有步骤都给出具体文件、代码、命令、预期输出。
- **Type consistency**
  - `mode/platform/flags` → `createEnv` 的 `CreateEnvOptions`；builder 返回的 `BuiltApp` 结构与启动时序一致。

