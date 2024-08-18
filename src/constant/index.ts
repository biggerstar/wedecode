/**
 * 插件目录统一重命名映射
 * */
export const pluginDirRename = ['__plugin__', 'plugin_']

/**
 * 清理缓存时移除文件的命中关键词，需要保证唯一特殊性
 * */
export const removeList = [
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
