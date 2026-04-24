import type { Asset, AssetManager, Constructor, SceneAsset } from 'cc';

/** Creator 3.8：`Bundle` 位于 `AssetManager` 命名空间下。 */
export type ResBundle = AssetManager.Bundle;

/**
 * 与 Creator 3.8.8 `Bundle.load` / `preload` / `loadScene` 中进度回调第三参 `item` 一致。
 * （引擎 `Bundle` 方法体里简写为 `RequestItem`，与 `AssetManager.RequestItem` 为同一类型。）
 */
export type ResBundleRequestItem = AssetManager.RequestItem;

/**
 * 与引擎 `Bundle.load*` 中 `onProgress` 参数形状一致（去掉 `onComplete` 后的可选中参之一）。
 */
export type ResBundleLoadProgress = (
    finished: number,
    total: number,
    item: ResBundleRequestItem,
) => void;

/**
 * 与 Creator 3.8.8 `Bundle.loadScene` 内联 `options` 对象一致（`preset` 在声明中为字面量 `"string"`，此处放宽为 `string` 以便业务传入实际 preset 名）。
 */
export type ResBundleLoadSceneOptions = {
    [key: string]: unknown;
    preset?: string;
} | null;

/**
 * `assetManager.loadRemote` 去掉末尾 `onComplete` 后的参数表。
 * 首参为 URL；其余与 Creator 3.8.8 引擎在回调前的可选参数对齐（本地 `cc` 声明若缺 `loadRemote`，不依赖 `Parameters<>` 推断以免退化为 `never`）。
 */
export type ResRemoteLoadArgs = [url: string, ...params: unknown[]];

/**
 * `Bundle.load` 去掉末尾 `onComplete` 后的实参表；联合元组与 Creator 3.8.8 `AssetManager.Bundle.load` 各重载一一对应（不采用 `Parameters<ResBundle['load']>`，避免重载下只解析到某一签）。
 */
export type ResBundleLoadArgs<T extends Asset = Asset> =
    | [paths: string]
    | [paths: string, type: Constructor<T> | null]
    | [paths: string, onProgress: ResBundleLoadProgress | null]
    | [paths: string, type: Constructor<T> | null, onProgress: ResBundleLoadProgress | null]
    | [paths: string[]]
    | [paths: string[], type: Constructor<T> | null]
    | [paths: string[], onProgress: ResBundleLoadProgress | null]
    | [paths: string[], type: Constructor<T> | null, onProgress: ResBundleLoadProgress | null];

/**
 * `Bundle.loadScene` 去掉末尾 `onComplete` 后的实参表；与 Creator 3.8.8 `Bundle.loadScene` 各重载对应。
 */
export type ResBundleLoadSceneArgs =
    | [sceneName: string]
    | [sceneName: string, options: ResBundleLoadSceneOptions]
    | [sceneName: string, onProgress: ResBundleLoadProgress | null]
    | [sceneName: string, options: ResBundleLoadSceneOptions, onProgress: ResBundleLoadProgress | null];

/**
 * `Bundle.preload` 去掉末尾 `onComplete` 后的实参表；与 Creator 3.8.8 `Bundle.preload` 各重载对应。
 */
export type ResBundlePreloadArgs =
    | [paths: string | string[]]
    | [paths: string | string[], type: Constructor<Asset> | null]
    | [paths: string | string[], onProgress: ResBundleLoadProgress | null]
    | [paths: string | string[], type: Constructor<Asset> | null, onProgress: ResBundleLoadProgress | null];

/**
 * `assetManager.loadBundle` 的 options 形状（去掉回调参数）。
 * Creator 3.8 声明里允许 `version?: string` 且可扩展任意字段；并允许传 `null`。
 */
export type ResBundleLoadOptions =
    | {
          [k: string]: unknown;
          version?: string;
      }
    | null;

export interface ResBundleSession {
    readonly bundle: ResBundle;
    load<T extends Asset>(...args: ResBundleLoadArgs<T>): Promise<T>;
    loadScene<T extends SceneAsset>(...args: ResBundleLoadSceneArgs): Promise<T>;
    preload(...args: ResBundlePreloadArgs): Promise<void>;
    dispose(): void;
}

export interface ResRemoteSession {
    load<T extends Asset>(...args: ResRemoteLoadArgs): Promise<T>;
    dispose(): void;
}

export interface ResService {
    readonly assetManager: AssetManager;
    getBundle(name: string): ResBundle | null;
    loadBundle(nameOrUrl: string, options?: ResBundleLoadOptions): Promise<ResBundleSession>;
    openRemoteSession(): ResRemoteSession;
}
