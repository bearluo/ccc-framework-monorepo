export interface UIManager {
    open(id: string, params?: unknown): Promise<void> | void;
    close(id: string): void;
}
