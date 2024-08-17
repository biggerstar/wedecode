import fs from "node:fs";
import path from "node:path";
import type {RmOptions} from "fs";
import {VM, VMOptions} from "vm2";
import {JSDOM} from "jsdom";
import {deepmerge} from "@biggerstar/deepmerge";
import {createWxFakeDom} from "../wx-dom";

export class DecompilationBase{
  protected static pluginDirRename = ['__plugin__', 'plugin_']
  protected static allUsingPluginPrivateFiles = []
  protected static removeList = [
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
    'plugin.json',
  ]
  public static readFile(path: string, encoding: BufferEncoding = 'utf-8'): string {
    return fs.existsSync(path) ? fs.readFileSync(path, encoding) : ''
  }

  /**
   * 顺序读取列表中的文件， 直到读取的文件包含内容
   * */
  public static readFileUntilContainContent(pathList: string[], encoding: BufferEncoding = 'utf-8'): {
    data: string,
    found: boolean,
    path: string
  } {
    for (const filePath of pathList) {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, encoding)
        if (data.length) {
          return {
            found: true,
            data,
            path: filePath
          }
        }
      }
    }
    return {
      found: false,
      data: '',
      path: ''
    }
  }

  /**
   * @param {string} filepath
   * @param {any} data
   * @param {Object} opt
   * @param {boolean} opt.force 是否强制覆盖, 默认为 false
   * @param {boolean} opt.emptyInstead 如果文原始件为空则允许覆盖
   * */
  public static saveFile(
    filepath: string,
    data: string | Buffer,
    opt: { force?: boolean, emptyInstead?: boolean } = {}
  ): boolean {
    filepath = filepath.replace(DecompilationBase.pluginDirRename[0], DecompilationBase.pluginDirRename[1]) // 重定向插件路径
    const targetData = fs.existsSync(filepath) ? fs.readFileSync(filepath, {encoding: 'utf-8'}).trim() : ''
    let force = typeof opt.force === 'boolean' ? opt.force : opt.emptyInstead || !targetData.length
    const outputDirPath = path.dirname(filepath)
    const isExistsFile = fs.existsSync(filepath)
    const isExistsPath = fs.existsSync(outputDirPath)
    if (isExistsFile && !force) return false
    if (!isExistsPath) {
      fs.mkdirSync(outputDirPath, {recursive: true})
    }
    if (typeof data === 'string') {
      const hasPluginPrivate = /plugin-private:\/\//.test(data)
      const hasPlugin = /plugin:\/\//.test(data)
      const allUsingPluginPrivateFiles = DecompilationBase.allUsingPluginPrivateFiles
      const hasBlackList = DecompilationBase.removeList.find(key => filepath.includes(key))
      if (
        !allUsingPluginPrivateFiles.includes(filepath) &&
        (hasPluginPrivate || hasPlugin) &&
        !hasBlackList
      ) {
        DecompilationBase.allUsingPluginPrivateFiles.push(filepath)
      }
    }
    fs.writeFileSync(filepath, data)
    return true
  }

  public static deleteFile(path: string, opt: RmOptions & { catch?: boolean } = {}): void {
    try {
      fs.rmSync(path, opt)
    } catch (e) {
      if (!opt.catch) throw e
    }
  }

  public static createVM(vmOptions: VMOptions = {}) {
    const domBaseHtml = `<!DOCTYPE html><html lang="en"><head><title>''</title></head><body></body></html>`
    const dom = new JSDOM(domBaseHtml);
    const vm_window = dom.window
    const vm_navigator = dom.window.navigator
    const vm_document = dom.window.document
    const __wxAppCode__ = {}
    const fakeGlobal = {
      __wxAppCode__,
      publishDomainComponents: () => void 0,
    }
    Object.assign(vm_window, fakeGlobal)
    return new VM(deepmerge({
      sandbox: {
        ...createWxFakeDom(),
        window: vm_window,
        location: dom.window.location,
        navigator: vm_navigator,
        document: vm_document,
        define: () => void 0,
        require: () => void 0,
        requirePlugin: () => void 0,
        global: {
          __wcc_version__: 'v0.5vv_20211229_syb_scopedata',
        },
        __vd_version_info__: {},
        __wxAppCode__,
        __wxCodeSpace__: {
          setRuntimeGlobals: () => void 0,
          addComponentStaticConfig: () => void 0,
          setStyleScope: () => void 0,
          addTemplateDependencies: () => void 0,
          batchAddCompiledScripts: () => void 0,
          batchAddCompiledTemplate: () => void 0,
        },
      }
    }, vmOptions));
  }
}
