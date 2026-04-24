import type { Token } from '../di';
import { getOrInitMeta, type AnyConstructor } from './decorator-meta';
import { registerDecoratedServices } from './register-decorated-services';

export type { AnyConstructor } from './decorator-meta';
export { FW_DECORATORS_META } from './decorator-meta';
export { registerDecoratedServices } from './register-decorated-services';

export type ServiceOptions<T> = { registerAs: Token<T> };

export function Service<T>(options: ServiceOptions<T>) {
    return <C extends AnyConstructor>(ctor: C): C => {
        const m = getOrInitMeta(ctor);
        m.service = { registerAs: options.registerAs as Token<unknown> };
        return ctor;
    };
}

export function Inject<T>(token: Token<T>): PropertyDecorator & ParameterDecorator {
    return ((target: object, propertyKey: string | symbol | undefined, parameterIndex?: unknown) => {
        if (typeof parameterIndex === 'number') {
            if (propertyKey !== undefined) {
                throw new Error('@Inject: method parameters are not supported in this version');
            }
            const ctor = target as AnyConstructor;
            const m = getOrInitMeta(ctor);
            if (!m.ctorParams) m.ctorParams = new Map();
            m.ctorParams.set(parameterIndex, token as Token<unknown>);
            return;
        }
        if (propertyKey === undefined) {
            return;
        }
        if (typeof target === 'function') {
            throw new Error('@Inject: static members are not supported in this version');
        }
        const ctor = (target as { constructor: AnyConstructor }).constructor;
        const m = getOrInitMeta(ctor);
        if (!m.props) m.props = new Map();
        m.props.set(propertyKey, token as Token<unknown>);
    }) as PropertyDecorator & ParameterDecorator;
}
