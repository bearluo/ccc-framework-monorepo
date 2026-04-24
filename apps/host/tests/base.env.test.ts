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
