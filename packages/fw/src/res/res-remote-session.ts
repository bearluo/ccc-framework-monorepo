import type { Asset, AssetManager } from 'cc';
import type { ResRemoteLoadArgs, ResRemoteSession } from './res-types';

function promisifyLoadRemote(am: AssetManager, args: ResRemoteLoadArgs): Promise<Asset> {
    return new Promise((resolve, reject) => {
        const onComplete = (err: Error | null, data: unknown) => {
            if (err) reject(err);
            else resolve(data as Asset);
        };
        (am as unknown as { loadRemote(...a: unknown[]): void }).loadRemote(...args, onComplete);
    });
}

/**
 * 与官方引用计数模型对齐：`loadRemote` 成功返回的资源在会话结束时按次 `decRef()`，
 * 不默认使用 `assetManager.releaseAsset()`。
 */
export class ResRemoteSessionImpl implements ResRemoteSession {
    private readonly acquires = new Map<Asset, number>();
    private closed = false;

    constructor(private readonly am: AssetManager) {}

    async load<T extends Asset>(...args: ResRemoteLoadArgs): Promise<T> {
        if (this.closed) {
            throw new Error('ResRemoteSession disposed');
        }
        const asset = (await promisifyLoadRemote(this.am, args)) as T;
        if (this.closed) {
            asset.decRef();
            return asset;
        }
        this.acquires.set(asset, (this.acquires.get(asset) ?? 0) + 1);
        return asset;
    }

    dispose(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;

        const errors: Error[] = [];
        for (const [asset, count] of [...this.acquires.entries()]) {
            for (let i = 0; i < count; i++) {
                try {
                    asset.decRef();
                } catch (e) {
                    errors.push(e instanceof Error ? e : new Error(String(e)));
                }
            }
        }
        this.acquires.clear();

        if (errors.length === 1) {
            throw errors[0];
        }
        if (errors.length > 1) {
            const msg = errors.map((e, i) => `[${i}] ${e.message}`).join('; ');
            throw new Error(`ResRemoteSession.dispose: decRef failed (${errors.length}): ${msg}`);
        }
    }
}
