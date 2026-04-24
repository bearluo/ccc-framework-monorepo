import { describe, expect, it } from 'vitest';
import { Container, createToken } from '@fw/base/di';
import { Inject, Service, registerDecoratedServices } from '@fw/base/decorators';

describe('decorators / explicit manifest', () => {
    it('exports Service and Inject', () => {
        expect(typeof Service).toBe('function');
        expect(typeof Inject).toBe('function');
        const T = createToken<number>('n');
        expect(typeof Inject(T)).toBe('function');
    });

    it('双 Container：同一类元数据分别装配得不同单例', () => {
        const T = createToken<{ id: string }>('dual-x');
        @Service({ registerAs: T })
        class X {
            id = Math.random().toString(36);
        }
        void X;
        const c1 = new Container();
        const c2 = new Container();
        registerDecoratedServices(c1, [X]);
        registerDecoratedServices(c2, [X]);
        const a = c1.resolve(T);
        const b = c2.resolve(T);
        expect(a).not.toBe(b);
    });

    it('classes 重复 ctor 抛错', () => {
        const T = createToken<unknown>('dup-t');
        @Service({ registerAs: T })
        class Y {}
        void Y;
        const c = new Container();
        expect(() => registerDecoratedServices(c, [Y, Y])).toThrow(/duplicate/);
    });

    it('无 @Service 的 ctor 入表抛错', () => {
        class Plain {}
        const c = new Container();
        expect(() => registerDecoratedServices(c, [Plain as never])).toThrow(/missing @Service/);
    });

    it('registerDecoratedServices 构造注入 + 属性注入', () => {
        const TB = createToken<{ v: number }>('em-ctor-b');
        const TA = createToken<{ inner: number }>('em-ctor-a');

        @Service({ registerAs: TA })
        class A {
            constructor(@Inject(TB) public readonly b: { v: number }) {}
            @Inject(TB)
            extra!: { v: number };
            get inner() {
                return this.b.v + this.extra.v;
            }
        }

        @Service({ registerAs: TB })
        class B {
            v = 3;
        }

        void A;
        void B;

        const c = new Container();
        registerDecoratedServices(c, [A, B]);
        expect(c.resolve(TA).inner).toBe(6);
    });

    it('方法参数 @Inject 抛错', () => {
        const T = createToken<number>('meth');
        expect(() => {
            class M {
                foo(@Inject(T) _x: number) {
                    return _x;
                }
            }
            void M;
        }).toThrow(/method parameters/);
    });

    it('Inject 静态位形（constructor 作 property target）抛错', () => {
        const T = createToken<number>('st');
        class Bad {}
        const dec = Inject(T);
        expect(() => {
            dec(Bad as unknown as object, 's');
        }).toThrow(/static/);
    });
});
