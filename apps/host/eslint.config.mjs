import tsParser from '@typescript-eslint/parser';
import tseslint from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: [
      'library/**',
      'temp/**',
      'local/**',
      'build/**',
      'profiles/**',
      'native/**',
      'node_modules/**',
      'coverage/**',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {},
  },
  {
    // gameplay 不允许被其它模块依赖
    // 允许：gameplay 自己、以及根入口 `assets/framework/index.ts` 做聚合导出
    files: ['**/*.ts'],
    ignores: ['assets/framework/index.ts', 'assets/framework/gameplay/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@fw/gameplay', '@fw/gameplay/*'],
              message: '禁止依赖 gameplay（仅 gameplay 模块内部可使用自身）。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['assets/framework/base/**/*.ts', 'assets/framework/utils/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@fw/gameplay', '@fw/gameplay/*'], message: 'base/utils 禁止依赖 gameplay。' },
            {
              group: [
                '@fw/storage',
                '@fw/storage/*',
                '@fw/net',
                '@fw/net/*',
                '@fw/res',
                '@fw/res/*',
                '@fw/ui',
                '@fw/ui/*',
              ],
              message: 'base/utils 禁止依赖 storage/net/res/ui。',
            },
          ],
        },
      ],
    },
  },
];

