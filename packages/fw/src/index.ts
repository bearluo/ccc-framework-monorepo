

export * as base from './base';
export * as utils from './utils';
export * as storage from './storage';
export * as net from './net';
export * as res from './res';
export * as ui from './ui';
export * as gameplay from './gameplay';

// Convenience re-exports (recommended for app-side imports).
export { buildApp } from './base/app';
export type { BuildAppOptions, BuiltApp } from './base/app';

export { Container, createToken } from './base/di';
export type { Token } from './base/di';

export { createEnv } from './base/env';
export type { Env, CreateEnvOptions } from './base/env';

export { EventBus } from './base/event';
export type { EventMap, Unsubscribe } from './base/event';

export { Service, Inject, registerDecoratedServices } from './base/decorators';
export type { ServiceOptions, AnyConstructor } from './base/decorators';

export { createResService, ResServiceImpl, resServiceToken } from './res';
export type { ResService } from './res';

export type { Context } from './base/context';

export { registerTimeService, timeServiceToken } from './base/time';

export { pickBundleBaseUrl, validateManifest } from './res/res-bundle-manifest';

export * from './subgame';