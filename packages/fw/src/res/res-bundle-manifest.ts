export type ResEnv = 'dev' | 'staging' | 'prod';

export type BundleEnvOverride = {
    /**
     * 传给 `assetManager.loadBundle(nameOrUrl)` 的 URL/路径前缀。
     * v1 只要求支持按环境覆盖 `baseUrl`。
     */
    baseUrl?: string;
    /** 预留：允许环境覆盖 version（v1 不强依赖）。 */
    version?: string;
};

export type BundleEntry = {
    baseUrl: string;
    version: string;
    env?: Partial<Record<ResEnv, BundleEnvOverride>>;
};

export type BundleManifest = {
    bundles: Record<string, BundleEntry>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${path} 必须是非空字符串`);
    }
}

/**
 * 最小校验：确保 `bundles[name].baseUrl/version` 存在且为非空字符串；若存在 env 覆盖则校验其字段类型。
 * 返回原对象本身（便于作为“已验证”标记在调用处复用）。
 */
export function validateManifest(input: BundleManifest): BundleManifest {
    if (!isPlainObject(input)) throw new Error('manifest 必须是对象');
    if (!isPlainObject((input as Record<string, unknown>).bundles)) throw new Error('manifest.bundles 必须是对象');

    const bundles = input.bundles as Record<string, unknown>;
    for (const [bundleName, entry] of Object.entries(bundles)) {
        const basePath = `manifest.bundles["${bundleName}"]`;
        if (!isPlainObject(entry)) throw new Error(`${basePath} 必须是对象`);

        assertNonEmptyString((entry as Record<string, unknown>).baseUrl, `${basePath}.baseUrl`);
        assertNonEmptyString((entry as Record<string, unknown>).version, `${basePath}.version`);

        const env = (entry as Record<string, unknown>).env;
        if (env === undefined) continue;
        if (!isPlainObject(env)) throw new Error(`${basePath}.env 必须是对象`);

        for (const [envName, override] of Object.entries(env)) {
            const envPath = `${basePath}.env["${envName}"]`;
            if (!isPlainObject(override)) throw new Error(`${envPath} 必须是对象`);

            if ((override as Record<string, unknown>).baseUrl !== undefined) {
                assertNonEmptyString((override as Record<string, unknown>).baseUrl, `${envPath}.baseUrl`);
            }
            if ((override as Record<string, unknown>).version !== undefined) {
                assertNonEmptyString((override as Record<string, unknown>).version, `${envPath}.version`);
            }
        }
    }

    return input;
}

export function pickBundleBaseUrl(manifest: BundleManifest, bundleName: string, env: ResEnv): string {
    const entry = manifest.bundles[bundleName];
    if (!entry) throw new Error(`manifest.bundles["${bundleName}"] 不存在`);

    const overrideBaseUrl = entry.env?.[env]?.baseUrl;
    if (overrideBaseUrl !== undefined) {
        if (typeof overrideBaseUrl !== 'string' || overrideBaseUrl.trim().length === 0) {
            throw new Error(`manifest.bundles["${bundleName}"].env["${env}"].baseUrl 必须是非空字符串`);
        }
        return overrideBaseUrl;
    }

    if (typeof entry.baseUrl !== 'string' || entry.baseUrl.trim().length === 0) {
        throw new Error(`manifest.bundles["${bundleName}"].baseUrl 必须是非空字符串`);
    }
    return entry.baseUrl;
}

export function pickBundleVersion(manifest: BundleManifest, bundleName: string, env: ResEnv): string {
    const entry = manifest.bundles[bundleName];
    if (!entry) throw new Error(`manifest.bundles["${bundleName}"] 不存在`);

    const overrideVersion = entry.env?.[env]?.version;
    if (overrideVersion !== undefined) {
        if (typeof overrideVersion !== 'string' || overrideVersion.trim().length === 0) {
            throw new Error(`manifest.bundles["${bundleName}"].env["${env}"].version 必须是非空字符串`);
        }
        return overrideVersion;
    }

    if (typeof entry.version !== 'string' || entry.version.trim().length === 0) {
        throw new Error(`manifest.bundles["${bundleName}"].version 必须是非空字符串`);
    }
    return entry.version;
}
