export type Token<T> = symbol & { __type?: T };

export function createToken<T>(description: string): Token<T> {
    return Symbol.for(description) as Token<T>;
}

type Provider<T> = () => T;

export class Container {
    private providers = new Map<symbol, Provider<any>>();
    private singletons = new Map<symbol, any>();

    register<T>(token: Token<T>, provider: Provider<T>): void {
        this.providers.set(token, provider);
    }

    registerSingleton<T>(token: Token<T>, provider: Provider<T>): void {
        this.providers.set(token, () => {
            if (this.singletons.has(token)) return this.singletons.get(token);
            const instance = provider();
            this.singletons.set(token, instance);
            return instance;
        });
    }

    resolve<T>(token: Token<T>): T {
        const provider = this.providers.get(token);
        if (!provider) throw new Error(`No provider for token: ${String(token)}`);
        return provider();
    }
}
