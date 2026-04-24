import { createToken, type Container, type Token } from '../di';

export type Cancel = () => void;

export interface Scheduler {
    setTimeout(cb: () => void, ms: number): Cancel;
    setInterval(cb: () => void, ms: number): Cancel;
}

export function createScheduler(): Scheduler {
    return {
        setTimeout(cb, ms) {
            const id = setTimeout(cb, ms);
            return () => clearTimeout(id);
        },
        setInterval(cb, ms) {
            const id = setInterval(cb, ms);
            return () => clearInterval(id);
        },
    };
}

/** 模块级等待；使用全局 `setTimeout`，不依赖容器。 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TimeService extends Scheduler {
    delay(ms: number): Promise<void>;
    delayOrCancelled(ms: number): Promise<boolean>;
    dispose(): void;
}

export const timeServiceToken: Token<TimeService> = createToken<TimeService>('ccc.fw.TimeService');

function disposedError(): Error {
    return new Error('TimeService disposed');
}

class TimeServiceImpl implements TimeService {
    private closed = false;
    private readonly active = new Set<Cancel>();

    constructor(private readonly scheduler: Scheduler) {}

    setTimeout(cb: () => void, ms: number): Cancel {
        if (this.closed) {
            throw disposedError();
        }
        const inner = this.scheduler.setTimeout(cb, ms);
        let cancel: Cancel;
        cancel = () => {
            if (this.active.delete(cancel)) {
                inner();
            }
        };
        this.active.add(cancel);
        return cancel;
    }

    setInterval(cb: () => void, ms: number): Cancel {
        if (this.closed) {
            throw disposedError();
        }
        const inner = this.scheduler.setInterval(cb, ms);
        let cancel: Cancel;
        cancel = () => {
            if (this.active.delete(cancel)) {
                inner();
            }
        };
        this.active.add(cancel);
        return cancel;
    }

    delay(ms: number): Promise<void> {
        if (this.closed) {
            return Promise.reject(disposedError());
        }
        return new Promise((resolve, reject) => {
            let settled = false;
            const timerCancel = this.scheduler.setTimeout(() => {
                if (settled) {
                    return;
                }
                settled = true;
                this.active.delete(wrapped);
                if (this.closed) {
                    reject(disposedError());
                } else {
                    resolve();
                }
            }, ms);

            let wrapped: Cancel;
            wrapped = () => {
                if (settled) {
                    return;
                }
                settled = true;
                if (this.active.delete(wrapped)) {
                    timerCancel();
                    reject(disposedError());
                }
            };
            this.active.add(wrapped);
        });
    }

    async delayOrCancelled(ms: number): Promise<boolean> {
        try {
            await this.delay(ms);
            return true;
        } catch {
            return false;
        }
    }

    dispose(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        for (const c of [...this.active]) {
            try {
                c();
            } catch {
                // ignore
            }
        }
        this.active.clear();
    }
}

export function registerTimeService(container: Container, scheduler?: Scheduler): void {
    container.registerSingleton(timeServiceToken, () => new TimeServiceImpl(scheduler ?? createScheduler()));
}
