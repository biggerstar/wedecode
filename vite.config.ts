import {resolve} from 'node:path';
import {cwd} from 'node:process'
import copy from "rollup-plugin-copy";
import {defineConfig} from "vite";

const external = [
  'commander',
  'css-tree',
  'cheerio',
  'cssbeautify',
  'escodegen',
  'esprima',
  'handlebars',
  'js-beautify',
  'uglify-js',
  'vite',
  'fs-extra',
  'vm2',
  'node:path',
  'node:process',
  'node:child_process',
  'node:module',
  'node:fs',
  'node:crypto',
  'picocolors',
  'jsdom',
  'glob',
  'inquirer',
  'inquirer/*',
  'figlet',
  'figlet',
  'figures',
  'update-check',
  'open-file-explorer',
  '@biggerstar/inquirer-selectable-table',
]


export default defineConfig(  {
  resolve: {
    extensions: [".ts", ".js", '.tsx', '.mjs'],
    alias: {
      "@": resolve(cwd(), 'src'),
      types: resolve(cwd(), 'src/types')
    }
  },
  build: {
    emptyOutDir: false,
    minify: false,
    outDir: resolve(cwd(), 'dist'),
    rollupOptions: {
      external,
      output: {
        sourcemap: false,
        globals: {}
      },
      treeshake: true
    },
    lib: {
      entry: resolve(cwd(), './src/bin/wedecode/wedecode.ts'),
      formats: ['es'],
      name: 'wedecode',
      fileName: () => 'wedecode.js',
    },
  },
  plugins: [
    copy({
      targets: [
        // 复制内置 polyfill
        { src: 'src/polyfill', dest: 'dist' },
      ]
    }),
  ]
})

