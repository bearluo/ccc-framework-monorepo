import { register } from 'node:module';

register(new URL('./node-cc-loader.mjs', import.meta.url), import.meta.url);
