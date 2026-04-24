import { describe, expect, it, vi } from 'vitest';

vi.mock('cc', () => ({
    assetManager: {
        loadBundle: vi.fn(),
        getBundle: vi.fn(),
    },
}));

import type { Asset, AssetManager } from 'cc';
import { createResService } from '../assets/framework/res/res-service';
import { ResRemoteSessionImpl } from '../assets/framework/res/res-remote-session';

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
    const shared = createFakeAsset('remote-a');

    const loadRemote = vi.fn((...args: unknown[]) => {
        const { onComplete } = peelOnComplete(args);
        queueMicrotask(() => onComplete(null, shared));
    });

    const am = {
        loadRemote,
        loadBundle: vi.fn(),
        getBundle: vi.fn(() => null),
    } as unknown as AssetManager;

    return { am, loadRemote, shared };
}

describe('res / remote session', () => {
    it('openRemoteSession：同 asset 两次 load，dispose 后 decRef 两次；再次 dispose 幂等', async () => {
        const { am, shared, loadRemote } = createDeps();
        const svc = createResService(am);
        const session = svc.openRemoteSession();

        const u1 = await session.load('https://example.com/a.png' as never);
        const u2 = await session.load('https://example.com/a.png' as never);
        expect(loadRemote).toHaveBeenCalled();
        expect(u1).toBe(u2);

        session.dispose();
        expect(shared.decRef).toHaveBeenCalledTimes(2);

        session.dispose();
        expect(shared.decRef).toHaveBeenCalledTimes(2);
    });

    it('load 失败：不记账，dispose 不 decRef', async () => {
        const shared = createFakeAsset('x');
        const loadRemote = vi.fn((...args: unknown[]) => {
            const { onComplete } = peelOnComplete(args);
            queueMicrotask(() => onComplete(new Error('network'), null));
        });
        const am = { loadRemote, loadBundle: vi.fn(), getBundle: vi.fn() } as unknown as AssetManager;
        const session = createResService(am).openRemoteSession();

        await expect(session.load('https://bad' as never)).rejects.toThrow(/network/);
        session.dispose();
        expect(shared.decRef).toHaveBeenCalledTimes(0);
    });

    it('dispose 后 load 应 reject', async () => {
        const { am } = createDeps();
        const session = createResService(am).openRemoteSession();
        session.dispose();
        await expect(session.load('https://x' as never)).rejects.toThrow(/disposed/i);
    });

    it('竞态：先 dispose 再 loadRemote 完成 → decRef 一次且仍 resolve', async () => {
        const shared = createFakeAsset('late');
        let finish: OnComplete | null = null;
        const loadRemote = vi.fn((...args: unknown[]) => {
            finish = peelOnComplete(args).onComplete;
        });
        const am = { loadRemote, loadBundle: vi.fn(), getBundle: vi.fn() } as unknown as AssetManager;

        const session = new ResRemoteSessionImpl(am);
        const pending = session.load('https://late' as never);
        session.dispose();
        finish!(null, shared);
        const asset = await pending;
        expect(asset).toBe(shared);
        expect(shared.decRef).toHaveBeenCalledTimes(1);
    });
});
