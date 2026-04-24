import { describe, expect, it } from 'vitest';
import { Lifecycle, LifecyclePhase } from '@fw/base/lifecycle';

describe('Lifecycle', () => {
    it('notifies subscribers for a phase', () => {
        const lc = new Lifecycle();
        const seen: LifecyclePhase[] = [];
        const off = lc.on('start', async () => {
            seen.push('start');
        });

        return lc.emit('start').then(() => {
            off();
            return lc.emit('start').then(() => {
                expect(seen).toEqual(['start']);
            });
        });
    });
});
