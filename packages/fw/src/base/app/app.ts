import type { Container } from '../di';
import type { Env } from '../env';

export interface AppOptions {
    env?: Env;
    container?: Container;
}

export class App {
    private started = false;

    constructor(private readonly options: AppOptions = {}) {}

    start(): void {
        if (this.started) return;
        this.started = true;

        void this.options;
    }

    stop(): void {
        if (!this.started) return;
        this.started = false;

        void this.options;
    }
}

