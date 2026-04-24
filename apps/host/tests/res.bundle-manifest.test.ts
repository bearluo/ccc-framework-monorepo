import { describe, expect, it } from 'vitest';

import { res } from '@ccc/fw';
import type { BundleManifest } from '@ccc/fw/res';

describe('res / bundle manifest', () => {
    it('缺字段（version/baseUrl）会 throw（错误信息包含 bundleName/字段名）', () => {
        const m1 = {
            bundles: {
                a: { version: '1.0.0' },
            },
        } as unknown as BundleManifest;
        expect(() => res.validateManifest(m1)).toThrow(/bundles\["a"\].baseUrl/);

        const m2 = {
            bundles: {
                b: { baseUrl: 'https://cdn.example.com/b/' },
            },
        } as unknown as BundleManifest;
        expect(() => res.validateManifest(m2)).toThrow(/bundles\["b"\].version/);
    });

    it('有 env 覆盖时 pick 选覆盖；无覆盖选默认', () => {
        const manifest: BundleManifest = {
            bundles: {
                a: {
                    baseUrl: 'https://cdn.example.com/a/prod/',
                    version: '1.2.3',
                    env: {
                        dev: { baseUrl: 'http://127.0.0.1:8080/a/dev/' },
                    },
                },
            },
        };

        expect(res.pickBundleBaseUrl(manifest, 'a', 'dev')).toBe('http://127.0.0.1:8080/a/dev/');
        expect(res.pickBundleBaseUrl(manifest, 'a', 'staging')).toBe('https://cdn.example.com/a/prod/');
    });

    it('未知 bundleName 会 throw', () => {
        const manifest: BundleManifest = {
            bundles: {
                a: { baseUrl: 'x', version: '1' },
            },
        };
        expect(() => res.pickBundleBaseUrl(manifest, 'missing', 'prod')).toThrow(/missing/);
    });
});

