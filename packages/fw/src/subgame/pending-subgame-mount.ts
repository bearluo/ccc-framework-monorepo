import type { SubgameMountPayload } from './types';

const PENDING_KEY = Symbol.for('ccc.fw.subgame.pendingMount');

function readPending(): SubgameMountPayload | undefined {
    return (globalThis as unknown as Record<symbol, unknown>)[PENDING_KEY] as SubgameMountPayload | undefined;
}

function writePending(value: SubgameMountPayload | undefined): void {
    if (value === undefined) {
        delete (globalThis as unknown as Record<symbol, unknown>)[PENDING_KEY];
        return;
    }
    (globalThis as unknown as Record<symbol, unknown>)[PENDING_KEY] = value as unknown as SubgameMountPayload;
}

export function setPendingSubgameMount(payload: SubgameMountPayload): void {
    if (readPending()) {
        throw new Error('Pending subgame mount already set (single-flight)');
    }
    writePending(payload);
}

export function consumePendingSubgameMount(): SubgameMountPayload {
    const pending = readPending();
    if (!pending) {
        throw new Error('No pending subgame mount payload');
    }
    writePending(undefined);
    return pending;
}
