import { createToken } from '../base/di';
import { assetManager } from 'cc';
import type { AssetManager } from 'cc';
import type { ResBundle, ResBundleSession, ResRemoteSession, ResService } from './res-types';
import { ResBundleSessionImpl } from './res-bundle-session';
import { ResRemoteSessionImpl } from './res-remote-session';
import { Service } from '../base/decorators';

/** DI 注册用；与 `createResService` 搭配 `Container.registerSingleton`。 */
export const resServiceToken = createToken<ResService>('ccc.fw.ResService');

function promisifyLoadBundle(am: AssetManager, nameOrUrl: string, options?: unknown): Promise<ResBundle> {
    return new Promise((resolve, reject) => {
        const onComplete = (err: Error | null, bundle: ResBundle | null) => {
            if (err) reject(err);
            else if (bundle) resolve(bundle);
            else reject(new Error('loadBundle: bundle is null'));
        };
        const loader = am as unknown as {
            loadBundle(name: string, optOrCb?: unknown, cb?: unknown): void;
        };
        if (options === undefined) {
            loader.loadBundle(nameOrUrl, onComplete);
        } else {
            loader.loadBundle(nameOrUrl, options, onComplete);
        }
    });
}
@Service({ registerAs: resServiceToken })
export class ResServiceImpl implements ResService {
    constructor(public readonly assetManager: AssetManager) {}

    getBundle(name: string): ResBundle | null {
        this.assetManager.downloader
        return this.assetManager.getBundle(name);
    }

    async loadBundle(nameOrUrl: string, options?: unknown): Promise<ResBundleSession> {
        const bundle = await promisifyLoadBundle(this.assetManager, nameOrUrl, options);
        return new ResBundleSessionImpl(bundle);
    }

    openRemoteSession(): ResRemoteSession {
        return new ResRemoteSessionImpl(this.assetManager);
    }
}

export function createResService(am?: AssetManager): ResService {
    return new ResServiceImpl(am ?? assetManager);
}
