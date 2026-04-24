import {
  type Context,
  registerDecoratedServices,
  registerTimeService,
  timeServiceToken,
  createResService,
  pickBundleBaseUrl,
  resServiceToken,
  launchParamsFromHostEnv,
  setPendingSubgameMount,
} from '@ccc/fw';
import { demoBundleManifestDev } from './bundle-manifest.dev';
import { _decorator, Component, director, Node, SceneAsset } from 'cc';
const { ccclass, property } = _decorator;
import * as fw from '@ccc/fw';
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
        // 需先在仓库根启动：`npm run remote:serve`，并把 game-template Web remote 产物放到
        // `remote-root/game-template/web-desktop/dev/game-template/`
        const baseUrl = pickBundleBaseUrl(demoBundleManifestDev, 'game-template', 'dev');
        const session = await resService.loadBundle(baseUrl);
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