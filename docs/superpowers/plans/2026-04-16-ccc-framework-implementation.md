# ccc-framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `assets/framework/` 骨架基础上，把本次通过的 spec（最小 public API 形态、依赖边界、工具链校验）落地为可 typecheck / lint / test 的最小实现。

**Architecture:** 框架以 `assets/framework/` 为唯一交付根目录，分层为 `base/utils/storage/net/res/ui/gameplay`。公共入口通过各层 `index.ts` 聚合导出；运行时核心对象先实现最小可用的 `Container`、`EventBus`、`Lifecycle`（基于 EventBus）、`Scheduler`（基于 setTimeout/setInterval），其它模块先以“接口形态 + 零副作用”落地。

**Tech Stack:** TypeScript（Creator tsconfig 继承链 + 独立 `tsconfig.eslint.json`）、ESLint、Prettier、Vitest

---

## 文件结构（本计划将创建/修改的文件）

**Create（规则与工具）**
- `.eslintrc.cjs`
- `.eslintignore`

**Modify（框架模块最小实现）**
- `assets/framework/base/env/index.ts`
- `assets/framework/base/context/index.ts`
- `assets/framework/base/lifecycle/index.ts`
- `assets/framework/base/time/index.ts`
- `assets/framework/base/decorators/index.ts`

**Modify（如需）**
- `package.json`（仅当 lint 命令需要更精确的 glob/忽略项）

**Test**
- `tests/base.lifecycle.test.ts`（新增）
- `tests/base.time.test.ts`（新增）

---

### Task 1: 添加 ESLint（模块边界 + gameplay 禁止反向依赖）

**Files:**
- Create: `.eslintrc.cjs`
- Create: `.eslintignore`

- [ ] **Step 1: 创建 `.eslintrc.cjs`**

写入以下内容：

```js
/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  env: {
    es2022: true,
    node: true,
  },
  ignorePatterns: [
    'library/',
    'temp/',
    'local/',
    'build/',
    'profiles/',
    'native/',
    'node_modules/',
    'coverage/',
    'dist/',
  ],
  rules: {
    // 避免误用 deep relative imports（跨模块时必须 @fw/...）
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['../assets/framework/**', '../../assets/framework/**', '../../../assets/framework/**'],
            message: '跨模块引用框架代码必须使用 @fw/...，不要使用跨层深相对路径。',
          },
        ],
      },
    ],
  },
  overrides: [
    // base/utils 最严：禁止依赖 storage/net/res/ui/gameplay
    {
      files: ['assets/framework/base/**/*.ts', 'assets/framework/utils/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@fw/gameplay', '@fw/gameplay/*'],
                message: 'base/utils 禁止依赖 gameplay。',
              },
              {
                group: [
                  '@fw/storage',
                  '@fw/storage/*',
                  '@fw/net',
                  '@fw/net/*',
                  '@fw/res',
                  '@fw/res/*',
                  '@fw/ui',
                  '@fw/ui/*',
                ],
                message: 'base/utils 禁止依赖 storage/net/res/ui。',
              },
            ],
          },
        ],
      },
    },
    // storage/net/res/ui 禁止依赖 gameplay
    {
      files: [
        'assets/framework/storage/**/*.ts',
        'assets/framework/net/**/*.ts',
        'assets/framework/res/**/*.ts',
        'assets/framework/ui/**/*.ts',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@fw/gameplay', '@fw/gameplay/*'],
                message: 'storage/net/res/ui 禁止依赖 gameplay。',
              },
            ],
          },
        ],
      },
    },
  ],
};
```

- [ ] **Step 2: 创建 `.eslintignore`**

写入以下内容：

```gitignore
library/
temp/
local/
build/
profiles/
native/
node_modules/
coverage/
dist/
```

- [ ] **Step 3: 运行 lint 验证 ESLint 可工作**

Run:

```bash
npm run lint
```

Expected:
- 退出码为 0
- 若出现 `parserOptions.project` 相关报错，修复方式应是调整 `tsconfig.eslint.json` 的 `include`（本仓库当前已包含 `assets/**/*.ts`、`tests/**/*.ts`、`vitest.config.ts`，理论上不应报错）

- [ ] **Step 4: Commit**

```bash
git add .eslintrc.cjs .eslintignore
git commit -m "chore: add eslint rules for module boundaries"
```

---

### Task 2: 落地 `Env` 最小形态（纯 TS，可 Node 下编译）

**Files:**
- Modify: `assets/framework/base/env/index.ts`
- Test: `tests/base.env.test.ts`（新增）

- [ ] **Step 1: 写失败测试（Env 形态与默认实现）**

Create: `tests/base.env.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createEnv } from '@fw/base/env';

describe('Env', () => {
  it('creates env with mode and optional platform', () => {
    const env = createEnv({ mode: 'dev', platform: 'test' });
    expect(env.mode).toBe('dev');
    expect(env.platform).toBe('test');
  });

  it('supports flags lookup', () => {
    const env = createEnv({ mode: 'prod', flags: { foo: true } });
    expect(env.getFlag?.('foo')).toBe(true);
    expect(env.getFlag?.('bar')).toBe(undefined);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- tests/base.env.test.ts
```

Expected: FAIL（提示 `createEnv` 未导出或模块为空）

- [ ] **Step 3: 写最小实现**

Update: `assets/framework/base/env/index.ts`

```ts
export interface Env {
  readonly mode: 'dev' | 'prod';
  readonly platform?: string;
  getFlag?(key: string): boolean | undefined;
}

export interface CreateEnvOptions {
  mode: Env['mode'];
  platform?: string;
  flags?: Record<string, boolean>;
}

export function createEnv(options: CreateEnvOptions): Env {
  const { mode, platform, flags } = options;
  return {
    mode,
    platform,
    getFlag: flags ? (key) => flags[key] : undefined,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test -- tests/base.env.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/framework/base/env/index.ts tests/base.env.test.ts
git commit -m "feat: add minimal Env interface and createEnv"
```

---

### Task 3: 落地 `Context` 最小形态（聚合运行时对象，不承载业务状态）

**Files:**
- Modify: `assets/framework/base/context/index.ts`
- Test: `tests/base.context.test.ts`（新增）

- [ ] **Step 1: 写失败测试（Context 聚合字段）**

Create: `tests/base.context.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { Container } from '@fw/base/di';
import { EventBus } from '@fw/base/event';
import { createEnv } from '@fw/base/env';
import { createContext } from '@fw/base/context';

type Events = { ping: { n: number } };

describe('Context', () => {
  it('aggregates env/container/events', () => {
    const env = createEnv({ mode: 'dev' });
    const container = new Container();
    const events = new EventBus<Events>();
    const ctx = createContext({ env, container, events });

    expect(ctx.env.mode).toBe('dev');
    expect(ctx.container).toBe(container);
    expect(ctx.events).toBe(events);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- tests/base.context.test.ts
```

Expected: FAIL（提示 `createContext` 未导出或模块为空）

- [ ] **Step 3: 写最小实现**

Update: `assets/framework/base/context/index.ts`

```ts
import type { Container } from '@fw/base/di';
import type { Env } from '@fw/base/env';
import type { EventBus, EventMap } from '@fw/base/event';

export interface Context<Events extends EventMap = any> {
  readonly env: Env;
  readonly container: Container;
  readonly events: EventBus<Events>;
}

export interface CreateContextOptions<Events extends EventMap> {
  env: Env;
  container: Container;
  events: EventBus<Events>;
}

export function createContext<Events extends EventMap>(options: CreateContextOptions<Events>): Context<Events> {
  return {
    env: options.env,
    container: options.container,
    events: options.events,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test -- tests/base.context.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/framework/base/context/index.ts tests/base.context.test.ts
git commit -m "feat: add minimal Context and createContext"
```

---

### Task 4: 落地 `Lifecycle`（最小阶段集合 + 订阅机制）

**Files:**
- Modify: `assets/framework/base/lifecycle/index.ts`
- Test: `tests/base.lifecycle.test.ts`

- [ ] **Step 1: 写失败测试（phase 订阅与触发）**

Create: `tests/base.lifecycle.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { Lifecycle, LifecyclePhase } from '@fw/base/lifecycle';

describe('Lifecycle', () => {
  it('notifies subscribers for a phase', () => {
    const lc = new Lifecycle();
    const seen: LifecyclePhase[] = [];
    const off = lc.on('start', async () => seen.push('start'));

    return lc.emit('start').then(() => {
      off();
      return lc.emit('start').then(() => {
        expect(seen).toEqual(['start']);
      });
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- tests/base.lifecycle.test.ts
```

Expected: FAIL（提示 `Lifecycle` 未实现/未导出）

- [ ] **Step 3: 写最小实现（基于 EventBus）**

Update: `assets/framework/base/lifecycle/index.ts`

```ts
import { EventBus, type Unsubscribe } from '@fw/base/event';

export type LifecyclePhase = 'boot' | 'start' | 'pause' | 'resume' | 'stop' | 'shutdown';

type Events = {
  [K in LifecyclePhase]: undefined;
};

export class Lifecycle {
  private bus = new EventBus<Events>();

  on(phase: LifecyclePhase, cb: () => void | Promise<void>): Unsubscribe {
    return this.bus.on(phase, async () => {
      await cb();
    });
  }

  async emit(phase: LifecyclePhase): Promise<void> {
    // EventBus 为同步分发；这里把回调统一包装为 async，并用微任务边界保证一致性
    this.bus.emit(phase, undefined);
    await Promise.resolve();
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test -- tests/base.lifecycle.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/framework/base/lifecycle/index.ts tests/base.lifecycle.test.ts
git commit -m "feat: add minimal Lifecycle based on EventBus"
```

---

### Task 5: 落地 `Scheduler`（time 模块最小可用，Node 环境可测）

**Files:**
- Modify: `assets/framework/base/time/index.ts`
- Test: `tests/base.time.test.ts`

- [ ] **Step 1: 写失败测试（timeout/interval 可取消）**

Create: `tests/base.time.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createScheduler } from '@fw/base/time';

describe('Scheduler', () => {
  it('supports setTimeout cancel', async () => {
    const s = createScheduler();
    let called = 0;
    const cancel = s.setTimeout(() => called++, 10);
    cancel();
    await new Promise((r) => setTimeout(r, 20));
    expect(called).toBe(0);
  });

  it('supports setInterval cancel', async () => {
    const s = createScheduler();
    let called = 0;
    const cancel = s.setInterval(() => called++, 5);
    await new Promise((r) => setTimeout(r, 16));
    cancel();
    const before = called;
    await new Promise((r) => setTimeout(r, 16));
    expect(called).toBe(before);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- tests/base.time.test.ts
```

Expected: FAIL（提示 `createScheduler` 未导出/模块为空）

- [ ] **Step 3: 写最小实现（基于全局 setTimeout/setInterval）**

Update: `assets/framework/base/time/index.ts`

```ts
export type Cancel = () => void;

export interface Scheduler {
  setTimeout(cb: () => void, ms: number): Cancel;
  setInterval(cb: () => void, ms: number): Cancel;
}

export function createScheduler(): Scheduler {
  return {
    setTimeout(cb, ms) {
      const id = setTimeout(cb, ms);
      return () => clearTimeout(id);
    },
    setInterval(cb, ms) {
      const id = setInterval(cb, ms);
      return () => clearInterval(id);
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test -- tests/base.time.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/framework/base/time/index.ts tests/base.time.test.ts
git commit -m "feat: add minimal Scheduler in base/time"
```

---

### Task 6: 为 `decorators` 提供“语义入口”但保持零策略绑定

**Files:**
- Modify: `assets/framework/base/decorators/index.ts`
- Test: `tests/base.decorators.test.ts`（新增）

- [ ] **Step 1: 写失败测试（装饰器可作为类型/值导出使用）**

Create: `tests/base.decorators.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { Inject, Service } from '@fw/base/decorators';
import { createToken } from '@fw/base/di';

describe('decorators', () => {
  it('exports Service and Inject decorators', () => {
    expect(typeof Service).toBe('function');
    expect(typeof Inject).toBe('function');
    const T = createToken<number>('n');
    expect(typeof Inject(T)).toBe('function');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- tests/base.decorators.test.ts
```

Expected: FAIL（提示未导出/模块为空）

- [ ] **Step 3: 写最小实现（只保证“可用作装饰器”，不做自动注册/反射）**

Update: `assets/framework/base/decorators/index.ts`

```ts
import type { Token } from '@fw/base/di';

export function Service(): ClassDecorator {
  return () => {
    // 语义入口：具体注册策略在后续实现阶段决定
  };
}

export function Inject(_token: Token<any>): PropertyDecorator | ParameterDecorator {
  return () => {
    // 语义入口：具体注入策略在后续实现阶段决定
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm test -- tests/base.decorators.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/framework/base/decorators/index.ts tests/base.decorators.test.ts
git commit -m "feat: add minimal semantic decorators entrypoints"
```

---

### Task 7: 全量验证（typecheck + lint + test）

**Files:**
- (none)

- [ ] **Step 1: typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS（无 TS 错误）

- [ ] **Step 2: lint**

Run:

```bash
npm run lint
```

Expected: PASS（无 ESLint 错误）

- [ ] **Step 3: test**

Run:

```bash
npm test
```

Expected: PASS（所有 tests 通过）

- [ ] **Step 4: Commit（如之前步骤均已单独提交，可跳过此提交）**

Run:

```bash
git status
```

Expected:
- working tree clean

---

## 计划自检（对照 spec）

- **Spec coverage**
  - 分层/依赖方向/公共入口：Task 1（ESLint 边界校验），并沿用现有 `@fw` alias 与 `index.ts` barrel
  - `Env` / `Context` / `Lifecycle` / `Scheduler` / `Decorators`：Task 2-6
  - “纯 TS、可 Node 下测试”：Task 2-6 的测试全部在 vitest/node 环境运行
- **Placeholder scan**
  - 本计划没有 “TBD/TODO/之后再补/类似 Task N” 等占位步骤；每一步都给出具体文件、代码、命令与预期结果。
- **Type consistency**
  - `Env`/`Context`/`LifecyclePhase`/`Scheduler` 与 spec 形态一致；`Lifecycle` 的实现选择基于 `EventBus`，不引入引擎依赖。

