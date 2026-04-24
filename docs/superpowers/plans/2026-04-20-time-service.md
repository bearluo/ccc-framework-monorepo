# TimeService Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `@fw/base/time` 增加 `sleep(ms)` 与容器化单例服务 `TimeService`（支持 `delay/delayOrCancelled/dispose`），由业务手动释放以统一关闭计时器。

**Architecture:** 在 `assets/framework/base/time/index.ts` 保持现有 `Scheduler`/`createScheduler`，新增 `TimeService` 接口与 `TimeServiceImpl` 实现；通过 `timeServiceToken` + `registerTimeService(container, scheduler?)` 注册为 `Container` 单例。`dispose()` 会取消所有活跃计时器并终止未完成的 delay。

**Tech Stack:** TypeScript, Vitest, 自研 `Container`（`assets/framework/base/di/index.ts`）

---

## 文件结构（将要改动/新增）

- Modify: `assets/framework/base/time/index.ts`
- Modify: `tests/base.time.test.ts`

---

### Task 1: `sleep(ms)`（模块级 await 等待）

**Files:**
- Modify: `assets/framework/base/time/index.ts`
- Test: `tests/base.time.test.ts`

- [ ] **Step 1: 写失败测试（sleep 会等待）**

Add to `tests/base.time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sleep } from '@fw/base/time';

describe('time.sleep', () => {
    it('await sleep resolves after ~ms', async () => {
        const t0 = Date.now();
        await sleep(15);
        const dt = Date.now() - t0;
        expect(dt).toBeGreaterThanOrEqual(10);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`  
Expected: FAIL（`sleep` 不存在/未导出）。

- [ ] **Step 3: 最小实现 `sleep(ms)`**

Add to `assets/framework/base/time/index.ts`:

```ts
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add assets/framework/base/time/index.ts tests/base.time.test.ts
git commit -m "feat(time): 增加 sleep(ms) 支持 await 等待"
```

---

### Task 2: `TimeService` token + 注册入口（只测注册与单例性）

**Files:**
- Modify: `assets/framework/base/time/index.ts`
- Test: `tests/base.time.test.ts`

- [ ] **Step 1: 写失败测试（容器注册 + resolve 单例）**

Add to `tests/base.time.test.ts`:

```ts
import { Container } from '@fw/base/di';
import { registerTimeService, timeServiceToken } from '@fw/base/time';

describe('TimeService / container', () => {
    it('registerTimeService registers singleton', () => {
        const c = new Container();
        registerTimeService(c);
        const t1 = c.resolve(timeServiceToken);
        const t2 = c.resolve(timeServiceToken);
        expect(t1).toBe(t2);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`  
Expected: FAIL（token/注册函数未实现）。

- [ ] **Step 3: 最小实现 token 与注册函数（delay 先占位）**

Implement in `assets/framework/base/time/index.ts`:

```ts
import { createToken, type Container, type Token } from '@fw/base/di';

export interface TimeService extends Scheduler {
    delay(ms: number): Promise<void>;
    delayOrCancelled(ms: number): Promise<boolean>;
    dispose(): void;
}

export const timeServiceToken: Token<TimeService> = createToken<TimeService>('fw.TimeService');

export function registerTimeService(container: Container, scheduler?: Scheduler): void {
    container.registerSingleton(timeServiceToken, () => {
        const s = scheduler ?? createScheduler();
        return {
            setTimeout: s.setTimeout,
            setInterval: s.setInterval,
            async delay() {
                throw new Error('not implemented');
            },
            async delayOrCancelled() {
                throw new Error('not implemented');
            },
            dispose() {},
        } satisfies TimeService;
    });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`  
Expected: PASS（本任务不触发 delay）。

- [ ] **Step 5: 提交**

```bash
git add assets/framework/base/time/index.ts tests/base.time.test.ts
git commit -m "feat(time): 增加 TimeService token 与容器注册入口"
```

---

### Task 3: `delay` / `delayOrCancelled` / `dispose`（可控 FakeScheduler）

**Files:**
- Modify: `assets/framework/base/time/index.ts`
- Test: `tests/base.time.test.ts`

- [ ] **Step 1: 在测试中加入 FakeScheduler（不依赖真实时间）**

Add to `tests/base.time.test.ts`:

```ts
type Cancel = () => void;

function createFakeScheduler() {
    type Task = { at: number; cb: () => void; cancelled: boolean };
    let now = 0;
    const tasks: Task[] = [];

    const setTimeoutFn = (cb: () => void, ms: number): Cancel => {
        const t: Task = { at: now + ms, cb, cancelled: false };
        tasks.push(t);
        return () => {
            t.cancelled = true;
        };
    };

    const setIntervalFn = (cb: () => void, ms: number): Cancel => {
        let cancelled = false;
        const tick = () => {
            if (cancelled) return;
            cb();
            setTimeoutFn(tick, ms);
        };
        const cancelFirst = setTimeoutFn(tick, ms);
        return () => {
            cancelled = true;
            cancelFirst();
        };
    };

    const advanceBy = (ms: number) => {
        now += ms;
        while (true) {
            const due = tasks.find((t) => !t.cancelled && t.at <= now);
            if (!due) break;
            due.cancelled = true;
            due.cb();
        }
    };

    return { scheduler: { setTimeout: setTimeoutFn, setInterval: setIntervalFn }, advanceBy };
}
```

- [ ] **Step 2: 写失败测试（delay 正常完成；dispose 触发取消语义）**

Add to `tests/base.time.test.ts`:

```ts
import { Container } from '@fw/base/di';
import { registerTimeService, timeServiceToken } from '@fw/base/time';

describe('TimeService / delay', () => {
    it('delay resolves after fake time advances', async () => {
        const { scheduler, advanceBy } = createFakeScheduler();
        const c = new Container();
        registerTimeService(c, scheduler);
        const time = c.resolve(timeServiceToken);

        let done = false;
        const p = time.delay(10).then(() => {
            done = true;
        });

        advanceBy(9);
        await Promise.resolve();
        expect(done).toBe(false);

        advanceBy(1);
        await p;
        expect(done).toBe(true);
    });

    it('delayOrCancelled returns true when completed', async () => {
        const { scheduler, advanceBy } = createFakeScheduler();
        const c = new Container();
        registerTimeService(c, scheduler);
        const time = c.resolve(timeServiceToken);

        const p = time.delayOrCancelled(10);
        advanceBy(10);
        await expect(p).resolves.toBe(true);
    });

    it('dispose cancels pending delay: delay rejects; delayOrCancelled resolves false', async () => {
        const { scheduler } = createFakeScheduler();
        const c = new Container();
        registerTimeService(c, scheduler);
        const time = c.resolve(timeServiceToken);

        const p1 = time.delay(999);
        const p2 = time.delayOrCancelled(999);

        time.dispose();

        await expect(p1).rejects.toThrow(/disposed|cancel/i);
        await expect(p2).resolves.toBe(false);
    });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test`  
Expected: FAIL（delay 仍为 not implemented）。

- [ ] **Step 4: 实现 `TimeServiceImpl`（追踪 cancel + pending）**

Replace the placeholder in `registerTimeService` with a real class:

```ts
class TimeServiceImpl implements TimeService {
    private closed = false;
    private readonly cancels = new Set<Cancel>();
    private readonly pendingCancels = new Set<Cancel>();

    constructor(private readonly scheduler: Scheduler) {}

    setTimeout(cb: () => void, ms: number): Cancel {
        if (this.closed) throw new Error('TimeService disposed');
        const cancel = this.scheduler.setTimeout(cb, ms);
        this.cancels.add(cancel);
        return () => {
            if (this.cancels.delete(cancel)) cancel();
        };
    }

    setInterval(cb: () => void, ms: number): Cancel {
        if (this.closed) throw new Error('TimeService disposed');
        const cancel = this.scheduler.setInterval(cb, ms);
        this.cancels.add(cancel);
        return () => {
            if (this.cancels.delete(cancel)) cancel();
        };
    }

    delay(ms: number): Promise<void> {
        if (this.closed) return Promise.reject(new Error('TimeService disposed'));
        return new Promise((resolve, reject) => {
            const cancel = this.scheduler.setTimeout(() => {
                this.pendingCancels.delete(cancelPending);
                if (this.closed) {
                    reject(new Error('TimeService disposed'));
                    return;
                }
                resolve();
            }, ms);

            const cancelPending = () => {
                cancel();
                reject(new Error('TimeService disposed'));
            };
            this.pendingCancels.add(cancelPending);
        });
    }

    async delayOrCancelled(ms: number): Promise<boolean> {
        try {
            await this.delay(ms);
            return true;
        } catch {
            return false;
        }
    }

    dispose(): void {
        if (this.closed) return;
        this.closed = true;
        for (const c of [...this.cancels]) {
            try { c(); } finally { this.cancels.delete(c); }
        }
        for (const c of [...this.pendingCancels]) {
            try { c(); } finally { this.pendingCancels.delete(c); }
        }
    }
}

export function registerTimeService(container: Container, scheduler?: Scheduler): void {
    container.registerSingleton(timeServiceToken, () => new TimeServiceImpl(scheduler ?? createScheduler()));
}
```

Notes:
- `delayOrCancelled` 复用 `delay`，并吞掉错误返回 boolean（符合 spec）。
- `dispose()` 幂等，取消 timer 并终止所有 delay。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test`  
Expected: PASS。

- [ ] **Step 6: 运行类型检查**

Run: `npm run typecheck`  
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add assets/framework/base/time/index.ts tests/base.time.test.ts
git commit -m "feat(time): 实现 TimeService 的 delay/delayOrCancelled/dispose"
```

---

### Task 4: 打磨与回归（避免未覆盖的行为）

**Files:**
- Modify: `tests/base.time.test.ts`（若需要）

- [ ] **Step 1: 增加 dispose 幂等测试**

```ts
it('dispose is idempotent', () => {
  const { scheduler } = createFakeScheduler();
  const c = new Container();
  registerTimeService(c, scheduler);
  const time = c.resolve(timeServiceToken);
  time.dispose();
  time.dispose();
});
```

- [ ] **Step 2: 运行测试与类型检查**

Run: `npm test`  
Run: `npm run typecheck`

- [ ] **Step 3: 提交（如有新增用例）**

```bash
git add tests/base.time.test.ts
git commit -m "test(time): 增加 TimeService dispose 幂等用例"
```

