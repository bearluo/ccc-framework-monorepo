import { describe, expect, it, vi } from 'vitest';

vi.mock('cc', () => ({
    assetManager: {
        loadBundle: vi.fn(),
        getBundle: vi.fn(),
    },
}));

import type { Asset, AssetManager } from 'cc';
import type { ResBundle } from '../assets/framework/res/res-types';
import { createResService } from '../assets/framework/res/res-service';
import { ResBundleSessionImpl } from '../assets/framework/res/res-bundle-session';

function createFakeAsset(name: string): Asset {
    return {
        name,
        decRef: vi.fn(),
    } as unknown as Asset;
}

type OnComplete = (err: Error | null, data: unknown) => void;

function peelOnComplete(args: unknown[]): { onComplete: OnComplete } {
    return { onComplete: args[args.length - 1] as OnComplete };
}

function createDeps() {
    const shared = createFakeAsset('A');

    const load = vi.fn((...args: unknown[]) => {
        const { onComplete } = peelOnComplete(args);
        queueMicrotask(() => onComplete(null, shared));
    });
    const loadScene = vi.fn((...args: unknown[]) => {
        const { onComplete } = peelOnComplete(args);
        queueMicrotask(() => onComplete(null, shared));
    });
    const preload = vi.fn((...args: unknown[]) => {
        const { onComplete } = peelOnComplete(args);
        queueMicrotask(() => onComplete(null, undefined));
    });
    const bundle = { load, loadScene, preload } as unknown as ResBundle;

    const loadBundle = vi.fn((_name: string, onComplete: OnComplete) => {
        queueMicrotask(() => onComplete(null, bundle));
    });

    const am = {
        loadBundle,
        getBundle: vi.fn(() => null),
    } as unknown as AssetManager;

    return { am, loadBundle, load, loadScene, preload, shared, bundle };
}

describe('res / bundle session', () => {
    it('同 asset 两次 load：dispose 后 decRef 两次；再次 dispose 幂等', async () => {
        const { am, shared, load } = createDeps();
        const svc = createResService(am);
        const session = await svc.loadBundle('main');

        const a1 = await session.load('p');
        const a2 = await session.load('p');
        expect(load).toHaveBeenCalled();
        expect(a1).toBe(a2);

        session.dispose();
        expect(shared.decRef).toHaveBeenCalledTimes(2);

        session.dispose();
        expect(shared.decRef).toHaveBeenCalledTimes(2);
    });

    it('preload 不计入 dispose 的 decRef', async () => {
        const { am, shared, preload } = createDeps();
        const session = await createResService(am).loadBundle('main');
        await session.preload('x');
        session.dispose();
        expect(preload).toHaveBeenCalled();
        expect(shared.decRef).toHaveBeenCalledTimes(0);
    });

    it('同 asset 两次 loadScene：dispose 后 decRef 两次', async () => {
        const { am, shared, loadScene } = createDeps();
        const session = await createResService(am).loadBundle('main');

        const s1 = await session.loadScene('Main');
        const s2 = await session.loadScene('Main');
        expect(loadScene).toHaveBeenCalled();
        expect(s1).toBe(s2);

        session.dispose();
        expect(shared.decRef).toHaveBeenCalledTimes(2);
    });

    it('dispose 后 load 应 reject', async () => {
        const { am } = createDeps();
        const session = await createResService(am).loadBundle('main');
        session.dispose();
        await expect(session.load('x')).rejects.toThrow(/disposed/);
    });

    it('竞态：先 dispose 再 load resolve → decRef 一次', async () => {
        const shared = createFakeAsset('late');
        let finish: OnComplete | null = null;
        const bundle = {
            load: vi.fn((...args: unknown[]) => {
                finish = peelOnComplete(args).onComplete;
            }),
            loadScene: vi.fn(),
            preload: vi.fn(),
        } as unknown as ResBundle;

        const loadBundle = vi.fn((_n: string, oc: OnComplete) => {
            queueMicrotask(() => oc(null, bundle));
        });
        const fam = { loadBundle, getBundle: vi.fn() } as unknown as AssetManager;

        const session = new ResBundleSessionImpl(bundle);
        const pending = session.load('x');
        session.dispose();
        finish!(null, shared);
        const asset = await pending;
        expect(asset).toBe(shared);
        expect(shared.decRef).toHaveBeenCalledTimes(1);
    });
});
