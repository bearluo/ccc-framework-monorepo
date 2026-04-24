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
