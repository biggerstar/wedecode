import {resolve} from 'node:path';
import {defineViteRunConfig, viteRunLogPlugin, ViteRunHandleFunctionOptions} from "vite-run";
import {cwd} from 'node:process'
import copy from "rollup-plugin-copy";

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
  'vite-run',
  'vm2',
  'node:path',
  'node:process',
  'node:module',
  'node:fs',
  'node:crypto',
  'picocolors',
  'jsdom',
  'glob',
  'inquirer',
  'figlet',
  'update-check',
]

export default defineViteRunConfig({
  baseConfig: getBaseConfig,
  packages: [
    './src/bin/*',
    'test'
  ],
  targets: {
    'wedecode': {
      dev: [
        ['wedecode', 'watch']
      ],
      build: [
        ['wedecode'],
      ],
    },
    'test': {
      dev: [['5000']],
    },
  },
  build: {
    umd: {
      lib: {
        formats: ['umd']
      }
    },
    es: {
      lib: {
        formats: ['es']
      },
    },
    watch: {
      watch: {},
    },
    minify: {
      minify: true
    },
    wedecode: (options: ViteRunHandleFunctionOptions) => {
      return {
        lib: {
          entry: resolve(options.packagePath, './wedecode.ts'),
          formats: ['es'],
          name: options.name,
          fileName: () => `wedecode.js`,
        },
        outDir: resolve(cwd(), 'dist'),
        rollupOptions: {
          watch: {},
          external: external
        },
      }
    },
  },
  server: {
    5000: {
      port: 5000
    }
  }
})

function getBaseConfig(options: ViteRunHandleFunctionOptions) {
  return {
    resolve: {
      extensions: [".ts", ".js"],
      alias: {
        "@": resolve(options.packagePath, 'src'),
        types: resolve(options.packagePath, 'src/types')
      }
    },
    build: {
      emptyOutDir: false,
      minify: false,
      rollupOptions: {
        output: {
          sourcemap: false,
          globals: {}
        },
        treeshake: true
      },
    },
    plugins: [
      copy({
        targets: [
          { src: 'src/polyfill', dest: 'dist' },
        ]
      }),
      viteRunLogPlugin({
        // server: {
        //     viteLog: true,
        //     viteRunLog: {
        //        sizeAntOutputPrint:false
        //     }
        // }
      }),
    ]
  }
}
