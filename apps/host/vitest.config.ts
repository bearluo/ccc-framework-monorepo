/// <reference types="node" />
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ccc/fw': resolve(process.cwd(), '../../packages/fw/src/index.ts'),
    },
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
  test: {
    environment: 'node',
    // 单一路径：以仓库根 `tests/` 为准，避免与 `apps/host/tests` 重复跑两遍
    include: ['../../tests/**/*.test.ts'],
  },
});
