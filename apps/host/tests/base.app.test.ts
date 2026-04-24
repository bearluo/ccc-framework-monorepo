import { describe, expect, it } from 'vitest';
import { App } from '@fw/base/app';

describe('App', () => {
    it('starts and stops without side effects', () => {
        const app = new App();
        expect(() => app.start()).not.toThrow();
        expect(() => app.stop()).not.toThrow();
    });
});
