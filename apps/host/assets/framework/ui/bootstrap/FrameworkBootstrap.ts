import { _decorator, Component } from 'cc';
import { buildApp, type Context } from '@ccc/fw';
const { ccclass, property } = _decorator;

type Mode = 'dev' | 'prod';

@ccclass('FrameworkBootstrap')
export class FrameworkBootstrap extends Component {
    private _context: Context | null = null;

    @property({ tooltip: 'Environment mode' })
    public mode: Mode = 'dev';

    @property({ tooltip: 'Optional platform tag' })
    public platform = '';

    @property({ tooltip: 'Optional JSON for boolean flags, e.g. {\"foo\":true}' })
    public flagsJson = '';

    @property({
        type: Component,
        tooltip:
            'Optional receiver component. If it implements onFrameworkContext(ctx), it will be called after app.start().',
    })
    public contextReceiver: Component | null = null;

    public get context(): Context {
        if (!this._context) {
            throw new Error('FrameworkBootstrap not started yet');
        }
        return this._context;
    }

    start(): void {
        const flags = this.parseFlagsJson(this.flagsJson);
        const built = buildApp({
            env: {
                mode: this.mode,
                platform: this.platform || undefined,
                flags,
            },
        });

        this._context = built.context;

        void built.lifecycle.emit('boot');
        built.app.start();

        this.notifyContextReceiver(this._context);

        void built.lifecycle.emit('start');
    }

    private notifyContextReceiver(ctx: Context): void {
        const receiver = this.contextReceiver;
        if (!receiver) return;

        const fn = (receiver as unknown as { onFrameworkContext?: unknown }).onFrameworkContext;
        if (typeof fn !== 'function') return;

        (fn as (c: Context) => void)(ctx);
    }

    private parseFlagsJson(raw: string): Record<string, boolean> | undefined {
        const trimmed = raw.trim();
        if (!trimmed) return undefined;

        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch (e) {
            throw new Error(`Invalid flagsJson: ${String(e)}`);
        }

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Invalid flagsJson: expected object map { [key]: boolean }');
        }

        const out: Record<string, boolean> = Object.create(null);
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
                throw new Error(`Invalid flagsJson: rejected key "${k}"`);
            }
            if (typeof v !== 'boolean') {
                throw new Error(`Invalid flagsJson: key "${k}" must be boolean`);
            }
            out[k] = v;
        }

        return out;
    }

    onDestroy(): void {
        this._context = null;
    }
}

