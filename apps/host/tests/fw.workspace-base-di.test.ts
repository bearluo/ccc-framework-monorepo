import { describe, expect, it } from 'vitest';

import { base } from '@ccc/fw';

describe('@ccc/fw / base.di', () => {
    it('Container + registerSingleton + resolve', () => {
        const c = new base.di.Container();
        const t = base.di.createToken<number>('test:number');
        c.registerSingleton(t, () => 1);
        expect(c.resolve(t)).toBe(1);
    });
});

