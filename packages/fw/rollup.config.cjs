const typescript = require('@rollup/plugin-typescript');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');

module.exports = {
    input: {
        index: 'src/index.ts',
    },
    output: {
        dir: 'dist',
        entryFileNames: '[name].js',
        format: 'esm',
        sourcemap: true,
        exports: 'named'
    },
    plugins: [
        nodeResolve({
            preferBuiltins: false,
            browser: true
        }),
        commonjs(),
        typescript({
            tsconfig: './tsconfig.json',
            declaration: true,
            declarationDir: './dist',
            declarationMap: true,
            sourceMap: true,
            rootDir: './src'
        })
    ],
    external: ['cc', '@cocos/creator-types']
};

