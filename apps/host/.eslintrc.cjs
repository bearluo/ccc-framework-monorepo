/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  env: {
    es2022: true,
    node: true,
  },
  ignorePatterns: [
    'library/',
    'temp/',
    'local/',
    'build/',
    'profiles/',
    'native/',
    '.worktrees/',
    'worktrees/',
    'node_modules/',
    'coverage/',
    'dist/',
  ],
  rules: {
    // 避免误用 deep relative imports（跨模块时必须 @fw/...）
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['../assets/framework/**', '../../assets/framework/**', '../../../assets/framework/**'],
            message: '跨模块引用框架代码必须使用 @fw/...，不要使用跨层深相对路径。',
          },
        ],
      },
    ],
  },
  overrides: [
    // base/utils 最严：禁止依赖 storage/net/res/ui/gameplay
    {
      files: ['assets/framework/base/**/*.ts', 'assets/framework/utils/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@fw/gameplay', '@fw/gameplay/*'],
                message: 'base/utils 禁止依赖 gameplay。',
              },
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
    // storage/net/res/ui 禁止依赖 gameplay
    {
      files: [
        'assets/framework/storage/**/*.ts',
        'assets/framework/net/**/*.ts',
        'assets/framework/res/**/*.ts',
        'assets/framework/ui/**/*.ts',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@fw/gameplay', '@fw/gameplay/*'],
                message: 'storage/net/res/ui 禁止依赖 gameplay。',
              },
            ],
          },
        ],
      },
    },
  ],
};
