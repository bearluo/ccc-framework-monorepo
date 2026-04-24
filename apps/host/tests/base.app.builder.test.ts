import { describe, expect, it } from 'vitest';
import { buildApp } from '@fw/base/app/builder';
import { App } from '@fw/base/app';
import { Container } from '@fw/base/di';
import { EventBus, type EventMap } from '@fw/base/event';
import { Lifecycle } from '@fw/base/lifecycle';

describe('buildApp', () => {
    it('builds minimal runtime objects', () => {
        const built = buildApp({
            env: { mode: 'dev', platform: 'test', flags: { foo: true } },
        });

        expect(built.app).toBeInstanceOf(App);
        expect(built.env.mode).toBe('dev');
        expect(built.env.platform).toBe('test');
        expect(built.env.getFlag).toBeTypeOf('function');
        expect(built.env.getFlag?.('foo')).toBe(true);

        expect(built.container).toBeInstanceOf(Container);
        expect(built.events).toBeInstanceOf(EventBus);
        expect(built.lifecycle).toBeInstanceOf(Lifecycle);
        expect(built.context).toBeDefined();
        expect(built.context.container).toBe(built.container);
        expect(built.context.events).toBe(built.events);
    });

    it('reuses injected container/events and wires them into context', () => {
        type Events = EventMap & {
            ping: { at: number };
        };

        const container = new Container();
        const events = new EventBus<Events>();

        const built = buildApp<Events>({
            env: { mode: 'dev', platform: 'test' },
            container,
            events,
        });

        expect(built.container).toBe(container);
        expect(built.events).toBe(events);
        expect(built.context.container).toBe(container);
        expect(built.context.events).toBe(events);
    });
});

