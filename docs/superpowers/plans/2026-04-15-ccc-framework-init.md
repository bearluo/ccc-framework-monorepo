# ccc-framework Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Cocos Creator 3.8.8 项目中初始化 `assets/framework/` 脚本框架骨架，建立 `@fw/*` import 规则，并用 ESLint 约束模块依赖方向，保证可导出为 Creator 资源包交付。

**Architecture:** 框架以 `assets/framework/` 为唯一交付根目录，分层为 `base/utils/storage/net/res/ui/gameplay`。通过 TypeScript `paths` 提供 `@fw/*` 别名，通过 ESLint `no-restricted-imports` 约束依赖方向与禁止对 `gameplay` 的反向依赖。

**Tech Stack:** TypeScript（Creator 继承 tsconfig）、Node.js + npm、ESLint（TypeScript 插件）、Prettier、Vitest（纯 TS 单测，用于不依赖 Creator 运行时的逻辑）。

---

## 文件结构（本计划将创建/修改的文件）

**Create（框架骨架）**
- `assets/framework/base/app/index.ts`
- `assets/framework/base/context/index.ts`
- `assets/framework/base/decorators/index.ts`
- `assets/framework/base/di/index.ts`
- `assets/framework/base/env/index.ts`
- `assets/framework/base/event/index.ts`
- `assets/framework/base/lifecycle/index.ts`
- `assets/framework/base/time/index.ts`
- `assets/framework/utils/index.ts`
- `assets/framework/storage/index.ts`
- `assets/framework/net/index.ts`
- `assets/framework/res/index.ts`
- `assets/framework/ui/index.ts`
- `assets/framework/gameplay/index.ts`
- `assets/framework/index.ts`

**Create（工具与配置）**
- `.editorconfig`
- `.eslintrc.cjs`
- `.eslintignore`
- `.prettierrc.json`
- `.prettierignore`
- `tsconfig.eslint.json`
- `vitest.config.ts`
- `tests/base.event.test.ts`
- `tests/base.di.test.ts`

**Modify**
- `package.json`（补齐 devDependencies 与 scripts）
- `tsconfig.json`（补齐 `baseUrl` + `paths`）
- `.gitignore`（补充忽略项：测试覆盖率等）

---

### Task 1: 落地 `assets/framework/` 目录与入口文件

**Files:**
- Create: `assets/framework/**`（见“文件结构”列表）

- [ ] **Step 1: 创建目录与空的入口导出（最小可编译）**

为以下文件写入最小内容（每个文件都必须是有效 TS，并且不依赖 Creator 运行时）：

`assets/framework/index.ts`

```ts
export * as base from '@fw/base';
export * as utils from '@fw/utils';
export * as storage from '@fw/storage';
export * as net from '@fw/net';
export * as res from '@fw/res';
export * as ui from '@fw/ui';
export * as gameplay from '@fw/gameplay';
```

`assets/framework/base/index.ts`

```ts
export * as app from '@fw/base/app';
export * as lifecycle from '@fw/base/lifecycle';
export * as event from '@fw/base/event';
export * as context from '@fw/base/context';
export * as time from '@fw/base/time';
export * as di from '@fw/base/di';
export * as env from '@fw/base/env';
export * as decorators from '@fw/base/decorators';
```

`assets/framework/<module>/index.ts`（`utils/storage/net/res/ui/gameplay` 都用同样模板）

```ts
// 模块公开入口（后续只从这里导出 public API）
export {};
```

`assets/framework/base/<sub>/index.ts`（`app/lifecycle/event/context/time/di/env/decorators` 同样模板）

```ts
export {};
```

- [ ] **Step 2: 运行 TypeScript 解析检查（先不做严格类型）**

Run:

```bash
npm -v
node -v
```

Expected: 能输出版本号（确保本机 Node/npm 可用）。

- [ ] **Step 3: Commit**

```bash
git add assets/framework
git commit -m "chore: add assets/framework skeleton"
```

---

### Task 2: 配置 `@fw/*` 路径别名（TypeScript）

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: 修改 `tsconfig.json` 增加 `baseUrl` 与 `paths`**

将 `tsconfig.json` 的 `compilerOptions` 调整为包含如下字段（保留原有 `extends`，并保留你需要的其它选项）：

```json
{
  "extends": "./temp/tsconfig.cocos.json",
  "compilerOptions": {
    "strict": false,
    "baseUrl": ".",
    "paths": {
      "@fw/*": ["assets/framework/*"]
    }
  }
}
```

- [ ] **Step 2: 添加一个用于 ESLint/测试的独立 tsconfig（避免 Creator 生成项干扰）**

Create: `tsconfig.eslint.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["assets/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json tsconfig.eslint.json
git commit -m "chore: add @fw path alias"
```

---

### Task 3: 建立 Node 工程化脚本（lint/format/test/typecheck）

**Files:**
- Modify: `package.json`
- Create: `.editorconfig`, `.prettierrc.json`, `.prettierignore`

- [ ] **Step 1: 将 `package.json` 扩展为可用的 npm 工程配置**

把 `package.json` 至少补齐以下字段（保留现有的 `name/uuid/creator` 字段）：

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p tsconfig.eslint.json --pretty false",
    "lint": "eslint .",
    "format": "prettier -w .",
    "test": "vitest run"
  }
}
```

并添加 devDependencies（用 npm 安装，版本由 npm 自动选择最新兼容版本）：

```bash
npm i -D typescript eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier vitest
```

- [ ] **Step 2: 添加基础 Prettier 配置**

Create: `.prettierrc.json`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

Create: `.prettierignore`

```gitignore
library/
temp/
local/
build/
profiles/
native/
node_modules/
dist/
coverage/
```

- [ ] **Step 3: 添加 `.editorconfig`（保证跨编辑器一致换行/缩进）**

Create: `.editorconfig`

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Commit**

```bash
git add package.json .prettierrc.json .prettierignore .editorconfig
git commit -m "chore: add tooling scripts (tsc/eslint/prettier/vitest)"
```

---

### Task 4: ESLint 规则（强制依赖方向 + 禁止依赖 gameplay）

**Files:**
- Create: `.eslintrc.cjs`, `.eslintignore`
- Modify: `package.json`（如需要补脚本或 eslint 选项）

- [ ] **Step 1: 创建 ESLint 配置（TypeScript + no-restricted-imports）**

Create: `.eslintrc.cjs`

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
  ignorePatterns: ['library/', 'temp/', 'local/', 'build/', 'profiles/', 'native/', 'node_modules/'],
  rules: {
    // 依赖方向：禁止任何模块 import gameplay（除了 gameplay 自己）
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@fw/gameplay', '@fw/gameplay/*'],
            message: '禁止依赖 gameplay（仅 gameplay 模块内部可使用自身）。',
          },
          {
            group: ['@fw/storage/*', '@fw/net/*', '@fw/res/*', '@fw/ui/*'],
            message: 'base/utils 不允许依赖 storage/net/res/ui。',
          },
        ],
      },
    ],
  },
  overrides: [
    // base/** 与 utils/** 的更严规则
    {
      files: ['assets/framework/base/**/*.ts', 'assets/framework/utils/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              { group: ['@fw/gameplay', '@fw/gameplay/*'], message: 'base/utils 禁止依赖 gameplay。' },
              {
                group: ['@fw/storage', '@fw/storage/*', '@fw/net', '@fw/net/*', '@fw/res', '@fw/res/*', '@fw/ui', '@fw/ui/*'],
                message: 'base/utils 禁止依赖 storage/net/res/ui。',
              },
            ],
          },
        ],
      },
    },
    // gameplay 允许依赖其它所有层（不需要额外规则）
  ],
};
```

> 说明：上面第一个 patterns 块里对 `@fw/storage/* ...` 的限制是“全局提示”，真正的硬限制在 overrides（base/utils）里。

- [ ] **Step 2: 创建 eslint ignore（与 gitignore 保持一致）**

Create: `.eslintignore`

```gitignore
library/
temp/
local/
build/
profiles/
native/
node_modules/
coverage/
```

- [ ] **Step 3: 运行 lint 验证配置可工作**

Run:

```bash
npm run lint
```

Expected: PASS（若出现 parserOptions.project 相关错误，优先检查 `tsconfig.eslint.json` include 是否覆盖到 eslint 扫描的文件）。

- [ ] **Step 4: Commit**

```bash
git add .eslintrc.cjs .eslintignore
git commit -m "chore: add eslint rules for module boundaries"
```

---

### Task 5: 最小可测试的 `event` 与 `di`（纯 TS，不依赖 Creator）

**Files:**
- Modify/Create: `assets/framework/base/event/index.ts`
- Modify/Create: `assets/framework/base/di/index.ts`
- Test: `tests/base.event.test.ts`, `tests/base.di.test.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: 添加最小事件总线 API（typed events）**

Update: `assets/framework/base/event/index.ts`

```ts
export type Unsubscribe = () => void;

export interface EventMap {
  [event: string]: unknown;
}

export class EventBus<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<(payload: any) => void>>();

  on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): Unsubscribe {
    const set = this.listeners.get(event) ?? new Set();
    set.add(cb as any);
    this.listeners.set(event, set);
    return () => this.off(event, cb);
  }

  off<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(cb as any);
    if (set.size === 0) this.listeners.delete(event);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) (cb as any)(payload);
  }
}
```

- [ ] **Step 2: 添加最小 DI 容器（token -> factory/singleton）**

Update: `assets/framework/base/di/index.ts`

```ts
export type Token<T> = symbol & { __type?: T };

export function createToken<T>(description: string): Token<T> {
  return Symbol(description) as Token<T>;
}

type Provider<T> = () => T;

export class Container {
  private providers = new Map<symbol, Provider<any>>();
  private singletons = new Map<symbol, any>();

  register<T>(token: Token<T>, provider: Provider<T>): void {
    this.providers.set(token, provider);
  }

  registerSingleton<T>(token: Token<T>, provider: Provider<T>): void {
    this.providers.set(token, () => {
      if (this.singletons.has(token)) return this.singletons.get(token);
      const instance = provider();
      this.singletons.set(token, instance);
      return instance;
    });
  }

  resolve<T>(token: Token<T>): T {
    const provider = this.providers.get(token);
    if (!provider) throw new Error(`No provider for token: ${String(token)}`);
    return provider();
  }
}
```

- [ ] **Step 3: 配置 vitest**

Create: `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: 添加单测（先写测试，再实现；若已实现则先回退到红再绿）**

Create: `tests/base.event.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { EventBus } from '@fw/base/event';

type Events = {
  ping: { n: number };
};

describe('EventBus', () => {
  it('calls listener with payload and allows unsubscribe', () => {
    const bus = new EventBus<Events>();
    const seen: number[] = [];
    const off = bus.on('ping', (p) => seen.push(p.n));
    bus.emit('ping', { n: 1 });
    off();
    bus.emit('ping', { n: 2 });
    expect(seen).toEqual([1]);
  });
});
```

Create: `tests/base.di.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { Container, createToken } from '@fw/base/di';

describe('Container', () => {
  it('resolves registered providers', () => {
    const c = new Container();
    const T = createToken<number>('num');
    c.register(T, () => 42);
    expect(c.resolve(T)).toBe(42);
  });

  it('supports singleton providers', () => {
    const c = new Container();
    const T = createToken<{ id: number }>('obj');
    let next = 0;
    c.registerSingleton(T, () => ({ id: ++next }));
    expect(c.resolve(T).id).toBe(1);
    expect(c.resolve(T).id).toBe(1);
  });
});
```

- [ ] **Step 5: 运行 typecheck + test**

Run:

```bash
npm run typecheck
npm test
```

Expected: 两条命令均 PASS。

- [ ] **Step 6: Commit**

```bash
git add assets/framework/base/event/index.ts assets/framework/base/di/index.ts vitest.config.ts tests
git commit -m "feat: add minimal EventBus and DI container"
```

---

### Task 6: `.gitignore` 补充（工具产物）

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 增加 coverage 与常见产物忽略**

在 `.gitignore` 追加：

```gitignore
# tooling
coverage/
dist/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore tooling outputs"
```

---

## 计划自检（对照 spec）

- 覆盖了 spec 的核心要求：
  - `assets/framework/` 分层结构落地（Task 1）
  - `@fw/*` alias 规则落地（Task 2）
  - 依赖方向规则可自动校验（Task 4）
  - “只含 TS 脚本”约束通过目录与配置体现（Task 1/3/4）
  - 导出交付流程在 spec 中已给出；本计划不额外实现 editor 导出自动化（符合 non-goals）
- 无占位符（无 TBD/TODO/“之后再说”式步骤）；每一步都有明确文件与命令。

