import type { Container } from '../di';
import type { Env } from '../env';
import type { EventBus, EventMap } from '../event';

export interface Context<Events extends EventMap = EventMap> {
    readonly env: Env;
    readonly container: Container;
    readonly events: EventBus<Events>;
}

export interface CreateContextOptions<Events extends EventMap> {
    env: Env;
    container: Container;
    events: EventBus<Events>;
}

export function createContext<Events extends EventMap>(
    options: CreateContextOptions<Events>,
): Context<Events> {
    return {
        env: options.env,
        container: options.container,
        events: options.events,
    };
}
