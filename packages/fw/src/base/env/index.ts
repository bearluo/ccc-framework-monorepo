export interface Env {
    readonly mode: 'dev' | 'prod';
    readonly platform?: string;
    getFlag?(key: string): boolean | undefined;
}

export interface CreateEnvOptions {
    mode: Env['mode'];
    platform?: string;
    flags?: Record<string, boolean>;
}

export function createEnv(options: CreateEnvOptions): Env {
    const { mode, platform, flags } = options;
    return {
        mode,
        platform,
        getFlag: flags ? (key) => flags[key] : undefined,
    };
}
