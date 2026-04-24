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
