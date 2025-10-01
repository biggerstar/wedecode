import {resolve} from 'node:path';
import {cwd} from 'node:process'
import copy from "rollup-plugin-copy";
import {defineConfig} from "vite";
import tsconfigPaths from 'vite-tsconfig-paths'
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
      "@/": resolve(cwd(), 'src/') ,
      types: resolve(cwd(), 'src/types')
    }
  },
  build: {
    emptyOutDir: false,
    minify: false,
    outDir: resolve(cwd(), 'dist'),
    target: 'node14',
    rollupOptions: {
      external,
      input: {
        wedecode: resolve(cwd(), './src/bin/wedecode/wedecode.ts'),
        'decompilation-controller': resolve(cwd(), './src/decompilation-controller.ts'),
        'decompilation-cli': resolve(cwd(), './src/decompilation-cli.ts'),
        'workspace/workspace-cli': resolve(cwd(), './src/workspace/workspace-cli.ts'),
        'workspace/workspace-server': resolve(cwd(), './src/workspace/workspace-server.ts')
      },
      output: {
        sourcemap: false,
        globals: {},
        entryFileNames: '[name].js',
        preserveModules: false,
        exports: 'named',
        manualChunks: undefined
      },
      treeshake: false
    }
  },
  plugins: [
    tsconfigPaths(),
    copy({
      targets: [
        // 复制内置 polyfill
        { src: 'src/polyfill', dest: 'dist' },
      ]
    }),
  ]
})

