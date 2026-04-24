import {
  type Context,
  registerDecoratedServices,
  registerTimeService,
  timeServiceToken,
  createResService,
  pickBundleBaseUrl,
  pickBundleVersion,
  resServiceToken,
  launchParamsFromHostEnv,
  setPendingSubgameMount,
  validateManifest,
} from '@ccc/fw';
import { _decorator, Component, director, Node, SceneAsset } from 'cc';
const { ccclass, property } = _decorator;
import * as fw from '@ccc/fw';
import type { BundleManifest } from '@ccc/fw';

function getRemoteRootBase(): string {
    // 优先：浏览器 query `?remoteRoot=http://127.0.0.1:8787/`
    try {
        const href = (globalThis as unknown as { location?: Location }).location?.href;
        if (href) {
            const url = new URL(href);
            const v = url.searchParams.get('remoteRoot');
            if (v && v.trim().length > 0) return v;
        }
    } catch {
        // ignore
    }
    return 'http://127.0.0.1:8787/';
}

async function loadRemoteBundleManifest(remoteRootBase: string, bundleName: string): Promise<BundleManifest> {
    const manifestUrl = new URL(`bundles/${bundleName}/manifest.json`, remoteRootBase).toString();
    const f = (globalThis as unknown as { fetch?: typeof fetch }).fetch;
    if (!f) throw new Error(`当前运行环境不支持 fetch，无法拉取远端 manifest：${manifestUrl}`);

    const res = await f(manifestUrl, { method: 'GET', cache: 'no-cache' });
    if (!res.ok) {
        throw new Error(`拉取远端 manifest 失败：${res.status} ${res.statusText} (${manifestUrl})`);
    }
    const json = (await res.json()) as BundleManifest;
    return validateManifest(json);
}
@ccclass('AppDev')
export class AppDev extends Component {
    start() {
        // 打印框架版本 同时保证fw代码全部被打入游戏
        console.log(fw.FW_VERSION);
    }

    update(deltaTime: number) {
        
    }

    async onFrameworkContext(ctx: Context) {
        console.log('onFrameworkContext', ctx);
        setContext(ctx);
        ctx.container.registerSingleton(resServiceToken, () => createResService());
        registerTimeService(ctx.container);
        registerDecoratedServices(ctx.container, []);

        const resService = ctx.container.resolve(resServiceToken);
        const timeService = ctx.container.resolve(timeServiceToken);
        console.log('resService', resService);
        // 需先在仓库根启动：`npm run remote:serve`（默认 8787），并把子游戏 bundle 发布到：
        // `remote-root/bundles/game-template/`（同目录包含 `manifest.json`）
        const remoteRootBase = getRemoteRootBase();
        const manifest = await loadRemoteBundleManifest(remoteRootBase, 'game-template');
        const baseUrl = pickBundleBaseUrl(manifest, 'game-template', 'dev');
        const version = pickBundleVersion(manifest, 'game-template', 'dev');
        const fullBaseUrl = new URL(baseUrl, remoteRootBase).toString();
        const session = await resService.loadBundle(fullBaseUrl, {
            version,
        });
        const launchParams = launchParamsFromHostEnv(ctx.env);
        setPendingSubgameMount({ hostContext: ctx, launchParams });
        const scene = await session.loadScene('game-template');
        console.log('scene', scene);
        await timeService.delay(1000);
        director.runScene(scene);
    }
}
// demo 简单起见，使用全局变量存储上下文
let globalContext: Context | null = null;

export function setContext(ctx: Context) {
    globalContext = ctx;
}

export function getContext(): Context {
    if (!globalContext) {
        throw new Error('Context has not been set.');
    }
    return globalContext;
}