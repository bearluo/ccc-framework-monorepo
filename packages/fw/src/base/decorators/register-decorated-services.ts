import type { Container } from '../di';
import { readDecoratorMeta, readServiceMeta, type AnyConstructor } from './decorator-meta';

function assertUniqueClasses(classes: readonly AnyConstructor[]): void {
    const seen = new Set<AnyConstructor>();
    for (const c of classes) {
        if (seen.has(c)) {
            throw new Error('registerDecoratedServices: duplicate constructor in classes');
        }
        seen.add(c);
    }
}

function createInstance(container: Container, ctor: AnyConstructor): unknown {
    const meta = readDecoratorMeta(ctor);
    if (!meta) {
        throw new Error('registerDecoratedServices: internal missing decorator meta');
    }
    const ctorParams = meta.ctorParams;
    let instance: unknown;
    if (ctorParams && ctorParams.size > 0) {
        const max = Math.max(...ctorParams.keys());
        const args: unknown[] = [];
        for (let i = 0; i <= max; i++) {
            const tok = ctorParams.get(i);
            args.push(tok !== undefined ? container.resolve(tok) : undefined);
        }
        instance = new (ctor as new (...args: unknown[]) => unknown)(...args);
    } else {
        instance = new (ctor as new () => unknown)();
    }
    if (meta.props) {
        const obj = instance as Record<PropertyKey, unknown>;
        for (const [k, tok] of meta.props) {
            obj[k] = container.resolve(tok);
        }
    }
    return instance;
}

export function registerDecoratedServices(container: Container, classes: readonly AnyConstructor[]): void {
    assertUniqueClasses(classes);
    for (const ctor of classes) {
        const svc = readServiceMeta(ctor);
        if (!svc) {
            throw new Error(
                `registerDecoratedServices: missing @Service on ${ctor.name || '(anonymous constructor)'}`,
            );
        }
        const { registerAs } = svc;
        container.registerSingleton(registerAs, () => createInstance(container, ctor));
    }
}
