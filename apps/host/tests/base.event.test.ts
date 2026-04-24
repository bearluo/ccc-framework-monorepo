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
