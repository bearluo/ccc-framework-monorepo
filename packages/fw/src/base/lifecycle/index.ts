import { EventBus, type Unsubscribe } from '../event';

export type LifecyclePhase = 'boot' | 'start' | 'pause' | 'resume' | 'stop' | 'shutdown';

type Events = {
    [K in LifecyclePhase]: undefined;
};

export class Lifecycle {
    private bus = new EventBus<Events>();

    on(phase: LifecyclePhase, cb: () => void | Promise<void>): Unsubscribe {
        return this.bus.on(phase, async () => {
            await cb();
        });
    }

    async emit(phase: LifecyclePhase): Promise<void> {
        // EventBus 为同步分发；这里把回调统一包装为 async，并用微任务边界保证一致性
        this.bus.emit(phase, undefined);
        await Promise.resolve();
    }
}
