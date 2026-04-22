import type { SubgameMountPayload } from './types';

let pending: SubgameMountPayload | undefined;

export function setPendingSubgameMount(payload: SubgameMountPayload): void {
    if (pending) {
        throw new Error('Pending subgame mount already set (single-flight)');
    }
    pending = payload;
}

export function consumePendingSubgameMount(): SubgameMountPayload {
    if (!pending) {
        throw new Error('No pending subgame mount payload');
    }
    const p = pending;
    pending = undefined;
    return p;
}
