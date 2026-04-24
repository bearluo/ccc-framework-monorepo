import type { Token } from '../di';

export type AnyConstructor<T = object> = new (...args: any[]) => T;

/** 与 spec 一致：元数据聚合挂在 ctor 上。 */
export const FW_DECORATORS_META = Symbol.for('ccc.fw.decorators');

export type ServiceMeta = { registerAs: Token<unknown> };

export type DecoratorMeta = {
    service?: ServiceMeta;
    props?: Map<PropertyKey, Token<unknown>>;
    ctorParams?: Map<number, Token<unknown>>;
};

function metaBag(ctor: AnyConstructor): Record<symbol, unknown> {
    return ctor as unknown as Record<symbol, unknown>;
}

export function readDecoratorMeta(ctor: AnyConstructor): DecoratorMeta | undefined {
    return metaBag(ctor)[FW_DECORATORS_META] as DecoratorMeta | undefined;
}

export function getOrInitMeta(ctor: AnyConstructor): DecoratorMeta {
    const bag = metaBag(ctor);
    let m = bag[FW_DECORATORS_META] as DecoratorMeta | undefined;
    if (!m) {
        m = {};
        bag[FW_DECORATORS_META] = m;
    }
    return m;
}

export function readServiceMeta(ctor: AnyConstructor): ServiceMeta | undefined {
    return readDecoratorMeta(ctor)?.service;
}
