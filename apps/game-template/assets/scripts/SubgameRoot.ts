import { _decorator, Component } from 'cc';
import {
  consumePendingSubgameMount,
  createSubgameGameContext,
  assertSubgameContextsIsolated,
  type Context,
} from '@ccc/fw';

const { ccclass } = _decorator;

@ccclass('SubgameRoot')
export class SubgameRoot extends Component {
  private _gameContext: Context | null = null;

  onLoad(): void {
    const payload = consumePendingSubgameMount();
    this._gameContext = createSubgameGameContext(payload.launchParams);
    assertSubgameContextsIsolated(payload, this._gameContext);
    void payload.hostContext;
    void this._gameContext;
  }
}
