import type { Asset, SceneAsset } from 'cc';
import type { ResBundle, ResBundleLoadArgs, ResBundleLoadSceneArgs, ResBundlePreloadArgs, ResBundleSession } from './res-types';

function promisifyBundleLoad<T extends Asset>(bundle: ResBundle, args: ResBundleLoadArgs<T>): Promise<Asset> {
    return new Promise((resolve, reject) => {
        const onComplete = (err: Error | null, data: unknown) => {
            if (err) reject(err);
            else resolve(data as Asset);
        };
        (bundle as unknown as { load(...a: unknown[]): void }).load(...args, onComplete);
    });
}

function promisifyBundlePreload(bundle: ResBundle, args: ResBundlePreloadArgs): Promise<void> {
    return new Promise((resolve, reject) => {
        const onComplete = (err: Error | null, _data: unknown) => {
            if (err) reject(err);
            else resolve();
        };
        (bundle as unknown as { preload(...a: unknown[]): void }).preload(...args, onComplete);
    });
}

function promisifyBundleLoadScene(bundle: ResBundle, args: ResBundleLoadSceneArgs): Promise<Asset> {
    return new Promise((resolve, reject) => {
        const onComplete = (err: Error | null, data: unknown) => {
            if (err) reject(err);
            else resolve(data as Asset);
        };
        (bundle as unknown as { loadScene(...a: unknown[]): void }).loadScene(...args, onComplete);
    });
}

/**
 * 与官方引用计数模型对齐：`bundle.load` 取得的资源在会话结束时按次调用 `decRef()`，
 * 而不是 `assetManager.releaseAsset()`（release 系列会跳过引用检查、强制释放，不适合作为默认会话配对）。
 *
 * dispose 时按 Map 迭代顺序处理；同一 Asset 按 acquire 次数依次 decRef。
 */
export class ResBundleSessionImpl implements ResBundleSession {
    private readonly acquires = new Map<Asset, number>();
    private closed = false;

    constructor(public readonly bundle: ResBundle) {}

    async load<T extends Asset>(...args: ResBundleLoadArgs<T>): Promise<T> {
        if (this.closed) {
            throw new Error('ResBundleSession disposed');
        }
        const asset = (await promisifyBundleLoad<T>(this.bundle, args)) as T;
        if (this.closed) {
            asset.decRef();
            return asset;
        }
        this.acquires.set(asset, (this.acquires.get(asset) ?? 0) + 1);
        return asset;
    }

    async loadScene<T extends SceneAsset>(...args: ResBundleLoadSceneArgs): Promise<T> {
        if (this.closed) {
            throw new Error('ResBundleSession disposed');
        }
        const asset = (await promisifyBundleLoadScene(this.bundle, args)) as T;
        if (this.closed) {
            asset.decRef();
            return asset;
        }
        this.acquires.set(asset, (this.acquires.get(asset) ?? 0) + 1);
        return asset;
    }

    async preload(...args: ResBundlePreloadArgs): Promise<void> {
        if (this.closed) {
            throw new Error('ResBundleSession disposed');
        }
        await promisifyBundlePreload(this.bundle, args);
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
            throw new Error(`ResBundleSession.dispose: decRef failed (${errors.length}): ${msg}`);
        }
    }
}
