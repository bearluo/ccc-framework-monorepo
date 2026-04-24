export type Unsubscribe = () => void;

export interface EventMap {
    [event: string]: unknown;
}

export class EventBus<Events extends EventMap> {
    private listeners = new Map<keyof Events, Set<(payload: any) => void>>();

    on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): Unsubscribe {
        const set = this.listeners.get(event) ?? new Set();
        set.add(cb as any);
        this.listeners.set(event, set);
        return () => this.off(event, cb);
    }

    off<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): void {
        const set = this.listeners.get(event);
        if (!set) return;
        set.delete(cb as any);
        if (set.size === 0) this.listeners.delete(event);
    }

    emit<K extends keyof Events>(event: K, payload: Events[K]): void {
        const set = this.listeners.get(event);
        if (!set) return;
        for (const cb of set) (cb as any)(payload);
    }
}
