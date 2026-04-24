import { validateManifest } from '@ccc/fw';

/** 本地 `npm run remote:serve`（默认 8787）下，对应 `remote-root/game-template/web-desktop/dev/game-template/` */
const GAME_TEMPLATE_REMOTE_DEV =
    'http://127.0.0.1:8787/game-template/web-desktop/dev/game-template';

export const demoBundleManifestDev = validateManifest({
    bundles: {
        /** 仍可从 `remote-root/update/` 提供旧 demo bundle 时使用 */
        update: {
            baseUrl: 'update',
            version: 'dev',
            env: {
                dev: { baseUrl: 'update' },
            },
        },
        /** 子游戏 `game-template`：构建产物拷到 remote-root 后由静态服务提供 */
        'game-template': {
            baseUrl: GAME_TEMPLATE_REMOTE_DEV,
            version: 'dev',
            env: {
                dev: { baseUrl: GAME_TEMPLATE_REMOTE_DEV },
            },
        },
    },
});

