import { createContext, type Context } from '../context';
import { Container } from '../di';
import { createEnv, type CreateEnvOptions, type Env } from '../env';
import { EventBus, type EventMap } from '../event';
import { Lifecycle } from '../lifecycle';
import { App } from './app';

export interface BuildAppOptions<Events extends EventMap = EventMap> {
    env: CreateEnvOptions;
    events?: EventBus<Events>;
    container?: Container;
}

export interface BuiltApp<Events extends EventMap = EventMap> {
    app: App;
    env: Env;
    container: Container;
    events: EventBus<Events>;
    lifecycle: Lifecycle;
    context: Context<Events>;
}

export function buildApp<Events extends EventMap = EventMap>(options: BuildAppOptions<Events>): BuiltApp<Events> {
    const env = createEnv(options.env);
    const container = options.container ?? new Container();
    const events = options.events ?? new EventBus<Events>();
    const lifecycle = new Lifecycle();
    const context = createContext({ env, container, events });
    const app = new App({ env, container });

    return { app, env, container, events, lifecycle, context };
}

