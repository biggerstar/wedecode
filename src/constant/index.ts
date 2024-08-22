export const isWindows = /^win/.test(process.platform);
export const isMac = /^darwin/.test(process.platform);

export const cssBodyToPageReg = /body\s*\{/g

/**
 * 默认输出路径， 基于 inputPath 路径
 * */
export const PUBLIC_OUTPUT_PATH = 'OUTPUT'
/**
 * 插件目录统一重命名映射
 * */
export const pluginDirRename = ['__plugin__', 'plugin_']

/**
 * 清理缓存时移除文件的命中关键词，需要保证唯一特殊性
 * */
export const removeAppFileList = [
  // 'app-config.json',
  'page-frame.html',
  'app-wxss.js',
  'app-service.js',
  'index.appservice.js',
  'index.webview.js',
  'appservice.app.js',
  'page-frame.js',
  'webview.app.js',
  'common.app.js',
  // 'plugin.json',
]

export const removeGameFileList = [
  // 'app-config.json',
  // 'game.js',
  'subContext.js',
  'worker.js',
]

export const appJsonExcludeKeys = [
  'navigateToMiniProgramAppIdList',
]

export const GameJsonExcludeKeys = [
  'openDataContext',
]
