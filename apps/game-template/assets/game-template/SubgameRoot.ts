import { _decorator, Component } from 'cc';
import {
    consumePendingSubgameMount,
    createSubgameGameContext,
    assertSubgameContextsIsolated,
    type Context,
    resServiceToken,
    type ResService,
    FW_VERSION,
} from '@ccc/fw';

const { ccclass } = _decorator;

@ccclass('SubgameRoot')
export class SubgameRoot extends Component {
    private _gameContext: Context | null = null;

    onLoad(): void {
        console.log(FW_VERSION);
    }

    start() {
        const payload = consumePendingSubgameMount();
        this._gameContext = createSubgameGameContext(payload.launchParams);
        assertSubgameContextsIsolated(payload, this._gameContext);

        const hostContext = payload.hostContext;
        const resService: ResService = hostContext.container.resolve(resServiceToken);
        resService.loadBundle('update').then(async (session) => {
            const scene = await session.loadScene('update');
            console.log('scene', scene);
        });

        void payload.hostContext;
        void this._gameContext;
    }
}
