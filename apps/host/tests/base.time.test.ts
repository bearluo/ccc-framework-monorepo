import { describe, expect, it } from 'vitest';
import { Container } from '@fw/base/di';
import {
    createScheduler,
    registerTimeService,
    sleep,
    timeServiceToken,
    type Cancel,
    type Scheduler,
} from '@fw/base/time';

describe('time.sleep', () => {
    it('await sleep resolves after ~ms', async () => {
        const t0 = Date.now();
        await sleep(15);
        const dt = Date.now() - t0;
        expect(dt).toBeGreaterThanOrEqual(10);
    });
});

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

/** 可控 `setTimeout`，用于 `TimeService.delay` 等用例（不依赖真实时间）。 */
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

    const setIntervalFn = (_cb: () => void, _ms: number): Cancel => {
        return () => {};
    };

    const advanceBy = (ms: number) => {
        now += ms;
        while (true) {
            const idx = tasks.findIndex((t) => !t.cancelled && t.at <= now);
            if (idx === -1) {
                break;
            }
            const t = tasks[idx]!;
            t.cancelled = true;
            t.cb();
        }
    };

    const scheduler: Scheduler = { setTimeout: setTimeoutFn, setInterval: setIntervalFn };
    return { scheduler, advanceBy };
}

describe('TimeService / container', () => {
    it('registerTimeService registers singleton', () => {
        const c = new Container();
        registerTimeService(c);
        const t1 = c.resolve(timeServiceToken);
        const t2 = c.resolve(timeServiceToken);
        expect(t1).toBe(t2);
    });
});

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

        await expect(p1).rejects.toThrow(/TimeService disposed/);
        await expect(p2).resolves.toBe(false);
    });

    it('dispose is idempotent', () => {
        const { scheduler } = createFakeScheduler();
        const c = new Container();
        registerTimeService(c, scheduler);
        const time = c.resolve(timeServiceToken);
        time.dispose();
        time.dispose();
        expect(() => time.setTimeout(() => {}, 1)).toThrow(/TimeService disposed/);
    });

    it('dispose clears pending TimeService.setTimeout', async () => {
        const { scheduler, advanceBy } = createFakeScheduler();
        const c = new Container();
        registerTimeService(c, scheduler);
        const time = c.resolve(timeServiceToken);
        let called = 0;
        time.setTimeout(() => {
            called++;
        }, 20);
        time.dispose();
        advanceBy(50);
        await Promise.resolve();
        expect(called).toBe(0);
    });

    it('setTimeout throws after dispose', () => {
        const { scheduler } = createFakeScheduler();
        const c = new Container();
        registerTimeService(c, scheduler);
        const time = c.resolve(timeServiceToken);
        time.dispose();
        expect(() => time.setTimeout(() => {}, 1)).toThrow(/TimeService disposed/);
    });
});
