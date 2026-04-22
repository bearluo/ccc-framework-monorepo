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

@ccclass('AppDev')
export class AppDev extends Component {
    start() {

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
        const baseUrl = pickBundleBaseUrl(demoBundleManifestDev, 'update', 'dev');
        const session = await resService.loadBundle(baseUrl);
        const launchParams = launchParamsFromHostEnv(ctx.env);
        setPendingSubgameMount({ hostContext: ctx, launchParams });
        const scene = await session.loadScene("update");
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