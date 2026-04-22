import { createContext, type Context } from '../base/context';
import { Container } from '../base/di';
import { createEnv } from '../base/env';
import type { CreateEnvOptions } from '../base/env';
import { EventBus, type EventMap } from '../base/event';
import type { SubgameMountPayload } from './types';

export function createSubgameGameContext<Events extends EventMap = EventMap>(
    launchParams: CreateEnvOptions,
): Context<Events> {
    const env = createEnv(launchParams);
    const container = new Container();
    const events = new EventBus<Events>();
    return createContext<Events>({ env, container, events });
}

export function assertSubgameContextsIsolated(payload: SubgameMountPayload, gameContext: Context): void {
    if (gameContext.env === payload.hostContext.env) {
        throw new Error('Invariant violated: gameContext.env must not share reference with hostContext.env');
    }
    if (gameContext.events === payload.hostContext.events) {
        throw new Error('Invariant violated: gameContext.events must not share reference with hostContext.events');
    }
    if (gameContext.container === payload.hostContext.container) {
        throw new Error('Invariant violated: gameContext.container must not share reference with hostContext.container');
    }
}
