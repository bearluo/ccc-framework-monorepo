import type { CreateEnvOptions } from '../base/env';
import type { Env } from '../base/env';

/**
 * 从 Host 的 Env 读取“值”，生成子游戏侧 `createEnv` 的入参。
 * 不返回、不引用 Host 的 Env 对象本身。
 *
 * 注意：`flags` 的可枚举快照不在此函数推导（需要 Host 显式提供 map 或扩展协议时再升级）。
 */
export function launchParamsFromHostEnv(env: Env): CreateEnvOptions {
    return {
        mode: env.mode,
        platform: env.platform,
    };
}
