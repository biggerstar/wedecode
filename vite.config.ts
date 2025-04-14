import {resolve} from 'node:path';
import {cwd} from 'node:process'
import copy from "rollup-plugin-copy";
import {defineConfig} from "vite";
import { builtinModules } from 'node:module'
import pkg from './package.json'

const external = [
  ...builtinModules,
  ...builtinModules.map(name=> `node:${name}`),
  ...Object.keys(pkg.dependencies),
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

