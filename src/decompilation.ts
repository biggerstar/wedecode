import type {RmOptions} from "fs";
import {VM, type VMOptions} from 'vm2'
import fs from "node:fs";
import colors from "picocolors";
import path from "node:path";
import {JSDOM} from "jsdom";
import {deepmerge} from "@biggerstar/deepmerge";
import {
  arrayDeduplication,
  commonDir, findCommonRoot,
  getPathInfo,
  jsBeautify,
  printLog,
  removeVM2ExceptionLine,
  replaceExt,
  sleep
} from "./common";
import {glob} from "glob";
import process from "node:process";
import {tryDecompileWxml} from "./lib/decompileWxml";
import {getZ} from "./lib/getZ";
import * as cheerio from "cheerio";
import cssbeautify from "cssbeautify";
import {data} from "cheerio/lib/api/attributes";

/**
 * HOOK 增加的全局变量   DecompilationWXS
 * */
export class DecompilationMicroApp {
  public readonly fileList: any[]
  public pathInfo: ReturnType<typeof getPathInfo>
  public outputPathInfo: ReturnType<typeof getPathInfo>
  public wxsList: any[]
  public packPath: string
  public packType: 'main' | 'sub' | 'independent'     // 主包 | 分包 | 独立分包
  public appType: 'app' | 'game'
  public packTypeMapping = {
    main: '主包',
    sub: '分包',
    independent: '独立分包',   // 还是分包， 只是不依赖主包模块
  }
  public appTypeMapping = {
    app: '小程序',
    game: '小游戏',
  }
  public codeInfo: {
    appConfigJson: string,
    appWxss: string,
    workers: string,
    pageFrame: string,
    pageFrameHtml: string,
    appService: string,
    gameJs: string,
    gameJson: string,
  }
  public rootCodeInfo: {
    appConfigJson: string,
    appWxss: string,
    workers: string,
    pageFrame: string,
    pageFrameHtml: string,
    appService: string,
    gameJs: string,
    gameJson: string,
  }
  public allRefComponentList: string[] = []
  public allSubPackagePages: string[] = []
  public DecompilationModules?: {
    modules: Record<string, Record<any, any> | Function>
    defines: Record<any, Record<any, any>>
    entrys: Record<string, { f: Function, j: any[], i: any[], ti: any[], ic: any[] }>
  }
  public DecompilationWXS?: Record<string, Function>
  public wxsRefInfo: Record<string, {
    vSrc?: string,
    src: string,
    fileSrc: string,
    moduleName?: string,
    templateList?: string[]
  }[]> = {}
  public allPloyFill: { fullPath: string, ployfillPath: string }[] = []
  private readonly _testCodeInfo: Record<'appService' | 'appWxss' | 'pageFrame', { path: string, code: string }>

  constructor(inputPath: string, outputPath?: string) {
    if (!outputPath) outputPath = path.resolve(path.dirname(inputPath), '__OUTPUT__')
    else outputPath = path.resolve(outputPath)
    this.pathInfo = getPathInfo(outputPath)  // 这个后面在解压完包的时候会进行分包路径重置
    this.outputPathInfo = getPathInfo(outputPath)  // 这个永远指向主包
    this.fileList = []
    this.packPath = inputPath
    this.codeInfo = {} as any
    if (path.extname(inputPath) !== '.wxapkg') {
      console.log(colors.red('\u274C  文件夹下不存在 .wxapkg 包'), inputPath)
      return
    }
    printLog('', {
      isEnd: true,
      interceptor: (log) => {
        // return !(log.includes('Completed') || log.includes('反编译所有'))
      }
    });
    this._testCodeInfo = {
      appService: {
        path: './test/js/app-service.js',
        code: ''
      },
      appWxss: {
        path: './test/js/app-wxss.js',
        code: ''
      },
      pageFrame: {
        path: './test/js/page-frame.js',
        code: ''
      },
    }
  }

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
        console.log(111, data)
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
  public static saveFile(filepath: string, data: any, opt: { force?: boolean, emptyInstead?: boolean } = {}): boolean {
    const targetData = fs.existsSync(filepath) ? fs.readFileSync(filepath, {encoding: 'utf-8'}).trim() : ''
    let force = typeof opt.force === 'boolean' ? opt.force : opt.emptyInstead || !targetData.length
    const outputDirPath = path.dirname(filepath)
    const isExistsFile = fs.existsSync(filepath)
    const isExistsPath = fs.existsSync(outputDirPath)
    if (isExistsFile && !force) return false
    if (!isExistsPath) {
      fs.mkdirSync(outputDirPath, {recursive: true})
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

    return new VM(deepmerge({
      sandbox: {
        console,
        setTimeout,
        setInterval,
        wx: {},
        getApp: () => ({}),
        window: vm_window,
        location: dom.window.location,
        navigator: vm_navigator,
        document: vm_document,
        define: () => void 0,
        require: () => void 0,
        __vd_version_info__: {},
        __wxAppCode__: {},
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

  /**
   * 获取包中的文件列表, 包含开始和结束的字节信息
   * */
  public genFileList(__APP_BUF__: Buffer) {
    const headerBuffer = __APP_BUF__.subarray(0, 14)
    /* 获取头字节数据 */
    let firstMark = headerBuffer.readUInt8(0);
    let infoListLength = headerBuffer.readUInt32BE(5);
    // let dataLength = headerBuffer.readUInt32BE(9);
    let lastMark = headerBuffer.readUInt8(13);
    if (firstMark !== 0xbe || lastMark !== 0xed) {
      console.log(` \n\u274C ${colors.red(
        '这不是一个正确的小程序包,在微信3.8版本以下的 PC, MAC 包需要解密\n' +
        '所以你需要尝试先使用项目中的解密工具 decryption-tool/UnpackMiniApp.exe 解密')}\n地址:  https://github.com/biggerstar/wedecode'`
      )
      process.exit(0)
    }

    const buf = __APP_BUF__.subarray(14, infoListLength + 14)
    let fileCount = buf.readUInt32BE(0);
    let fileList = [], off = 4;
    for (let i = 0; i < fileCount; i++) {
      let info: Record<any, any> = {};
      let nameLen = buf.readUInt32BE(off);
      off += 4;
      info.name = buf.toString('utf8', off, off + nameLen);
      off += nameLen;
      info.off = buf.readUInt32BE(off);
      off += 4;
      info.size = buf.readUInt32BE(off);
      off += 4;
      fileList.push(info);
    }
    return fileList
  }

  /** 保存该包中的所有文件 */
  public async unpackWxapkg() {
    const __APP_BUF__ = fs.readFileSync(this.packPath)
    const fileList = this.genFileList(__APP_BUF__)
    this.fileList.splice(0, this.fileList.length, ...fileList)
    this.packType = 'sub'
    this.appType = 'app'
    const subPackRootPath = findCommonRoot(this.fileList.map(item => item.name))
    if (subPackRootPath) {
      this.pathInfo.setPackRootPath(subPackRootPath)
    }
    for (let info of this.fileList) {
      const fileName = info.name.startsWith("/") ? info.name.slice(1) : info.name
      const data = __APP_BUF__.subarray(info.off, info.off + info.size)
      /*------------------------------------------------*/
      const subRootPath = this.pathInfo.outputResolve(fileName)
      DecompilationMicroApp.saveFile(subRootPath, data)
      /*------------------------------------------------*/
    }
    const appConfigJsonString = DecompilationMicroApp.readFile(this.pathInfo.appConfigJsonPath)
    if (appConfigJsonString) {  // 独立分包也拥有自己的 app-config
      const appConfig: Record<any, any> = JSON.parse(appConfigJsonString)
      const foundThatSubPackages = (appConfig.subPackages || []).find((sub: any) => sub.root === `${subPackRootPath}/`)
      if (!foundThatSubPackages) {
        this.packType = 'main'
      } else if (typeof foundThatSubPackages === 'object' && foundThatSubPackages['independent']) {
        this.packType = 'independent'
      }
    }
    if (fs.existsSync(this.outputPathInfo.gameJsPath)) {
      this.appType = 'game'
    }
    printLog(`\n \u25B6 解小程序压缩包成功! 文件总数: ${colors.green(this.fileList.length)}`, {isStart: true})
  }

  public getPackCodeInfo(pathInfo: ReturnType<typeof getPathInfo>): typeof this.codeInfo {
    function readFile(path: string) {
      if (!path) return ''
      const content = DecompilationMicroApp.readFile(path)
      return content.length > 100 ? content : ''
    }

    let pageFrameHtmlCode = readFile(pathInfo.pageFrameHtmlPath)
    if (pageFrameHtmlCode) {
      const $ = cheerio.load(pageFrameHtmlCode);
      pageFrameHtmlCode = $('script').text()
    }
    const appServiceCode = readFile(pathInfo.appServicePath)
    this._testCodeInfo.appService.code = appServiceCode
    return {
      appConfigJson: readFile(pathInfo.appConfigJsonPath),
      appWxss: readFile(pathInfo.appWxssPath),
      appService: appServiceCode,
      pageFrame: readFile(pathInfo.pageFramePath),
      workers: readFile(pathInfo.workersPath),
      pageFrameHtml: pageFrameHtmlCode,
      gameJs: readFile(pathInfo.gameJsPath),
      gameJson: readFile(pathInfo.gameJsonPath),
    }
  }

  /**
   * 为分包注入主包的环境代码, 自动分辨注入小程序或者小游戏代码
   * */
  public injectMainPackCode(vm: VM, env: Record<any, any> = {}) {
    if (this.packType === 'main') return
    if (this.appType === 'game') {
      let baseEnvGameCode1 = this.rootCodeInfo.gameJs
      try {
        if (baseEnvGameCode1) vm.run(baseEnvGameCode1)
      } catch (e) {

      }
    } else {
      let baseEnvCode1 = this.rootCodeInfo.appWxss || this.rootCodeInfo.pageFrame || this.rootCodeInfo.pageFrameHtml
      let baseEnvCode2 = this.rootCodeInfo.appService || this.rootCodeInfo.pageFrame || this.rootCodeInfo.pageFrameHtml
      try {
        if (baseEnvCode1) vm.run(baseEnvCode1)
      } catch (e) {
      }
      try {
        if (baseEnvCode2) vm.run(baseEnvCode2)
      } catch (e) {

      }
      vm.sandbox.$gwx = vm.sandbox.$gwx || (() => void 0)
      // if (!vm.sandbox.$gwx) {
      //   vm.sandbox.$gwx = (() => void 0)
      // }
    }
    Object.assign(vm.sandbox, env)
  }

  public async init() {
    await this.unpackWxapkg()
    printLog(` \u25B6 当前反编译目标[ ${this.appTypeMapping[this.appType]} ] (${colors.yellow(this.packTypeMapping[this.packType])}) : ` + colors.blue(this.packPath));
    printLog(` \u25B6 当前输出目录:  ${colors.blue(this.pathInfo.outputPath)}\n`, {
      isEnd: true,
    });
    this.codeInfo = this.getPackCodeInfo(this.pathInfo)
    this.rootCodeInfo = this.getPackCodeInfo(this.outputPathInfo)
    const customHeaderPathPart = path.resolve(path.dirname(this.packPath), 'polyfill')
    const customPloyfillGlobMatch = path.resolve(customHeaderPathPart, './**/*.js')
    const customPloyfill: string[] = glob.globSync(customPloyfillGlobMatch)
    const customPloyfillInfo = customPloyfill.map(str => {
      return {fullPath: str, ployfillPath: path.relative(customHeaderPathPart, str)}
    })
    //  内置 polyfill
    const urls = new URL(import.meta.url)
    const headerPathPart = path.resolve(path.dirname(urls.pathname), 'polyfill')
    const ployfillGlobMatch = path.resolve(headerPathPart, './**/*.js')
    let builtinPloyfill: string[] = glob.globSync(ployfillGlobMatch)
    const builtinPloyfillInfo = builtinPloyfill.map(str => {
      return {fullPath: str, ployfillPath: path.relative(headerPathPart, str)}
    })
    this.allPloyFill = [...customPloyfillInfo, ...builtinPloyfillInfo]
  }

  /**
   * 初始化, 所有后续反编译且不会被动态改变的所需要的信息都在这里加载
   * 记住一个准则： 读取都使用 packRootPath 路径， 保存都使用 outputPath 路径
   * */
  public async initApp() {
    if (!this.fileList.length) {
      console.log(colors.red('\u274C  包还未解压，请先调用 unpackWxapkg 函数解压.'))
      process.exit(0)
    }
    // console.log(this.codeInfo)
    // console.log({...this.pathInfo})
    // console.log({...this.outputPathInfo})
    //  用户 polyfill
    const loadInfo = {}
    for (const name in this.codeInfo) {
      loadInfo[name] = this.codeInfo[name].length
    }
    console.log(loadInfo)
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame || this.codeInfo.pageFrameHtml
    // console.log(code)
    if (!code) {
      if (this.packType === 'main') {
        console.log(colors.red('\u274C  没有找到包特征文件'))
      }
      return
    }
    const vm = DecompilationMicroApp.createVM()
    code = code.replaceAll('var e_={}', `var e_ = {}; window.DecompilationModules = global;`)
    code = code.replace(
      'var nom={};return function(n){',
      'var nom={}; window.DecompilationWXS = nnm; return function(n){ var keepPath = n; '
    ).replace(
      'return function(){if(!nnm[n])',
      'return function(){ if (window.isHookReady){ return keepPath }; if(!nnm[n])'
    )
    code = code + ';window.isHookReady = true'
    this.injectMainPackCode(vm)
    vm.run(code)

    this._testCodeInfo["appWxss"].code = code
    this.DecompilationModules = vm.sandbox.window['DecompilationModules'] || {}
    this.DecompilationWXS = vm.sandbox.window['DecompilationWXS'] || {}
    for (const filepath in this.DecompilationModules.modules) {
      if (path.extname(filepath) !== '.wxml') continue
      const wxmlRefWxsMap = this.DecompilationModules.modules[filepath]
      if (!this.wxsRefInfo[filepath]) this.wxsRefInfo[filepath] = []
      for (const moduleName in wxmlRefWxsMap) {
        const vSrc = wxmlRefWxsMap[moduleName]()
        if (typeof vSrc === 'string') {
          const src: string = vSrc.replace('p_', '').replace('m_', '')
          this.wxsRefInfo[filepath].push({
            src: src,
            fileSrc: src.includes(':') ? src.split(':')[0] : src,
            vSrc,
            moduleName,
            templateList: []
          })
        }
      }
    }

    if (this.packType === 'main') {
      const appConfig: Record<any, any> = JSON.parse(this.codeInfo.appConfigJson)
      const allPageJsonConfig = appConfig.page
      this.allRefComponentList = arrayDeduplication(Object.keys(allPageJsonConfig || {})
        .map((pagePath: any) => {
          const pageInfo = allPageJsonConfig[pagePath]
          const allRefComponents: string[] = Object.values(pageInfo?.window?.['usingComponents'] || {})
          return allRefComponents.map(compRelativePath => {
            return `.${path.resolve(path.relative(this.pathInfo.resolve(pagePath), compRelativePath))}`
          })
        })
        .flat(2))

      this.allSubPackagePages = (appConfig.subPackages || [])
        .map((subPackage: any) => appConfig.pages.filter((pagePath: string) => pagePath.startsWith(subPackage.root)))
        .flat(2)
    }
  }

  /**
   * 解析出 app.json 文件， 只有主包需要处理
   * */
  public async decompileAppJSON() {
    if (this.packType !== 'main') return
    await sleep(200)
    const appConfigString = this.codeInfo.appConfigJson
    const appConfig: Record<any, any> = JSON.parse(appConfigString)
    Object.assign(appConfig, appConfig.global)
    delete appConfig.global
    delete appConfig.page
    appConfig.plugins = {}
    if (appConfig.entryPagePath) appConfig.entryPagePath = appConfig.entryPagePath.replace('.html', '')
    if (appConfig.renderer) {
      appConfig.renderer = appConfig.renderer.default || 'webview'
    }

    if (appConfig.extAppid)
      DecompilationMicroApp.saveFile(this.pathInfo.outputResolve('ext.json'), JSON.stringify({
        extEnable: true,
        extAppid: appConfig.extAppid,
        ext: appConfig.ext
      }, null, 2))

    if (appConfigString.includes('"renderer": "skyline"') || appConfigString.includes('"renderer":"skyline"')) {
      appConfig.lazyCodeLoading = "requiredComponents"
      delete appConfig.window['navigationStyle']
      delete appConfig.window['navigationBarTextStyle']
      delete appConfig.window['navigationBarTitleText']
      delete appConfig.window['navigationBarBackgroundColor']
    }

    const entrys = this.DecompilationModules?.entrys || {}
    const entryList = Object.keys(entrys).map(str => replaceExt(str.replace('./', ''), ''))
    if (appConfig.pages) {
      appConfig.pages = arrayDeduplication(appConfig.pages.concat(entryList))
    }
    if (appConfig.subPackages) {
      let subPackages = [];
      appConfig.subPackages.forEach((subPackage: Record<any, any>) => {
        let root = subPackage.root;
        let newPages = [];
        root = !String(root).endsWith('/') ? root + '/' : root
        root = String(root).startsWith('/') ? root.substring(1) : root
        subPackage.root = root;
        if (Array.isArray(appConfig.pages)) {
          for (let pageString of appConfig.pages) {
            if (pageString.startsWith(root)) {
              newPages.push(pageString.replace(root, ''));
            }
          }
          subPackage.pages = newPages;
        }
        delete subPackage.plugins
        subPackages.push(subPackage);
      })
      subPackages = subPackages.filter(sub => (sub.pages || []).length > 0)
      if (Object.keys(subPackages).length >= 100) {
        console.log(` ▶ ${colors.red('程序主动结束编译, 因为 subPackages 包个数超过限制 100, 超过微信限制')}`)
        process.exit(0)
      }
      delete appConfig.subPackages
      appConfig.subPackages = subPackages;
    }
    if (appConfig.pages) {
      appConfig.pages =/*必须在subPackages 之后*/ arrayDeduplication<string>(appConfig.pages, (_, cur) => !this.allSubPackagePages.includes(cur))
    }

    if (appConfig.tabBar) {
      if (!appConfig.tabBar.list) appConfig.tabBar.list = []
      const allDecompilationBeforeFileList = glob.globSync(`${this.pathInfo.outputPath}/**`)
      const allFileBufferInfo = allDecompilationBeforeFileList
        .filter(filePath => !fs.statSync(filePath).isDirectory())
        .map(filePath => {
          return {
            data: DecompilationMicroApp.readFile(filePath, 'base64'),
            path: filePath
          }
        })
      appConfig.tabBar.list = appConfig.tabBar.list.map((info: Record<any, any>) => {
        const result: Record<any, any> = {text: info.text}
        result.pagePath = info.pagePath.replace('.html', '')
        if (info.iconData) {
          const found = allFileBufferInfo.find(item => item.data === info.iconData)
          if (found) result.iconPath = path.relative(this.pathInfo.outputPath, found.path)
        }
        if (info.selectedIconData) {
          const found = allFileBufferInfo.find(item => item.data === info.selectedIconData)
          if (found) result.selectedIconPath = path.relative(this.pathInfo.outputPath, found.path)
        }
        return result
      })
    }
    const outputFileName = 'app.json'
    const appConfigSaveString = JSON.stringify(appConfig, null, 2)
    DecompilationMicroApp.saveFile(this.pathInfo.outputResolve(outputFileName), appConfigSaveString, {force: true})
    printLog(" Completed " + ` (${appConfigSaveString.length}) \t` + colors.bold(colors.gray(this.pathInfo.outputResolve(outputFileName))))
    printLog(` \u25B6 反编译 ${outputFileName} 文件成功. \n`, {isStart: true})

  }

  /**
   * 处理子包 json，只需要处理主包， 子包解压自带 json
   * */
  public async decompileAppPageJSON() {
    if (this.packType !== 'main') return
    const appConfig: Record<any, any> = JSON.parse(this.codeInfo.appConfigJson)   // 黑名单模式: 直接操作 app-config.json 可以适配官方未来可能增加的配置字段
    let __wxAppCode__ = {}
    const vm = DecompilationMicroApp.createVM({
      sandbox: {
        __wxAppCode__: __wxAppCode__
      }
    })
    vm.run(this.codeInfo.appService)
    for (const filePath in __wxAppCode__) {
      if (path.extname(filePath) !== '.json') continue
      console.log(filePath)
      let htmlName = replaceExt(filePath, ".html")
      if (typeof __wxAppCode__[filePath] === 'object') {
        appConfig.page[htmlName] = appConfig.page[htmlName] || {}
        if (!appConfig.page[htmlName].window) appConfig.page[htmlName].window = {}
        deepmerge(appConfig.page[htmlName].window, __wxAppCode__[filePath], {safe: false})
      }
    }
    for (let pageHtmlPath in appConfig.page) {
      // console.log(pageHtmlPath)
      const pageJsonConfig = appConfig.page[pageHtmlPath]
      const pageJsonPath = replaceExt(pageHtmlPath, ".json")
      const realJsonConfig: Record<any, any> = pageJsonConfig.window || {}
      realJsonConfig.backgroundColorTop = realJsonConfig.backgroundTopColor
      const deleteKeys = [
        'enableFSTCollect',
        'enableFSPCollect',
        'fstIgnoredClassNames',
        'enableFSPImageCollect',
        'hideCapsuleButtons',
        'rendererType',
        'widgetBackgroundColor',
        'enablePageScroll',
        'backgroundTopColor',
        'enableBeforeUnload',
        'alipayStyleIsolation',
        'fstContainerId',
        '__warning__',
        'sdkVersionEnd',
        'window',
        'initialRenderingSnapshot',
      ]
      deleteKeys.forEach(key => delete realJsonConfig[key])
      if (realJsonConfig.rendererOptions?.['skyline']) {
        delete realJsonConfig.rendererOptions['skyline']['disableABTest']
        delete realJsonConfig.rendererOptions['skyline']['sdkVersionBegin']
        delete realJsonConfig.rendererOptions['skyline']['sdkVersionEnd']
      }
      const oldFileJson = DecompilationMicroApp.readFile(this.pathInfo.outputResolve(pageJsonPath))
      if (oldFileJson) {
        deepmerge(realJsonConfig, JSON.parse(oldFileJson))
      }
      realJsonConfig.component = true
      if (realJsonConfig.renderer === 'skyline') {
        realJsonConfig.componentFramework = realJsonConfig.componentFramework || "glass-easel"
      }
      let realJsonConfigString = JSON.stringify(realJsonConfig, null, 2)
      printLog(" Completed " + ` (${realJsonConfigString.length}) \t` + colors.bold(colors.gray(pageJsonPath)))
      DecompilationMicroApp.saveFile(this.pathInfo.outputResolve(pageJsonPath), realJsonConfigString)
    }
    printLog(` \u25B6 反编译所有 page json 文件成功. \n`, {isStart: true})
  }

  public async decompileAppJS() {
    const _this = this
    const vm = DecompilationMicroApp.createVM({
      sandbox: {
        define(name: string, func: string) {
          /* 看看是否有 polyfill,  有的话直接使用注入 polyfill */
          const foundPloyfill = _this.allPloyFill.find(item => {
            return name.endsWith(item.ployfillPath)
          })
          let resultCode: string = ''
          if (foundPloyfill) {
            resultCode = DecompilationMicroApp.readFile(foundPloyfill.fullPath)
          } else {
            let code = func.toString();
            code = code.slice(code.indexOf("{") + 1, code.lastIndexOf("}") - 1).trim();
            resultCode = code;
            if (code.startsWith('"use strict";') || code.startsWith("'use strict';")) {
              code = code.slice(13);
            } else if ((code.startsWith('(function(){"use strict";') || code.startsWith("(function(){'use strict';")) && code.endsWith("})();")) {
              code = code.slice(25, -5);
            }
            code = code.replaceAll('require("@babel', 'require("./@babel')
            resultCode = jsBeautify(code);
          }
          if (resultCode.trim()) {
            DecompilationMicroApp.saveFile(_this.pathInfo.outputResolve(name), removeVM2ExceptionLine(resultCode), {force: true})
            printLog(" Completed " + ` (${resultCode.length}) \t` + colors.bold(colors.gray(name)))
          }
        },
        require: () => void 0,
        definePlugin: () => void 0,
        requirePlugin: () => void 0,
      }
    })
    if (this.codeInfo.appService) {
      this.injectMainPackCode(vm)
      vm.run(this.codeInfo.appService)
      printLog(` \u25B6 反编译所有 js 文件成功. \n`, {isStart: true})
    }
  }

  public async decompileAppWXSS() {
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame || this.codeInfo.pageFrameHtml
    if (!code.trim()) return
    const vm = DecompilationMicroApp.createVM()
    this.injectMainPackCode(vm)
    vm.run(code)
    const __wxAppCode__ = vm.sandbox['__wxAppCode__']
    if (!__wxAppCode__) return
    Object.keys(__wxAppCode__).forEach(filepath => path.extname(filepath) === '.wxss' && __wxAppCode__[filepath]())
    const allHeadElement: HTMLStyleElement[] = Array.from(vm.sandbox.window.document.head.children)
    allHeadElement.forEach(styleEl => {
      const attr = styleEl.attributes.getNamedItem('wxss:path')
      if (!attr) return
      const outPath = attr.value
      let cssText = styleEl.innerHTML
      if (cssText && outPath && outPath !== 'undefined') {
        cssText = cssText.replace(/body\s*\{/g, 'page{')  // 不太严谨， 后面使用 StyleSheet 进行处理
        DecompilationMicroApp.saveFile(this.pathInfo.outputResolve(outPath), cssbeautify(cssText))
        printLog(" Completed " + ` (${cssText.length}) \t` + colors.bold(colors.gray(outPath)))
      }

    })
    printLog(` \u25B6 反编译所有 wxss 文件成功. \n`, {isStart: true})
  }

  public async decompileAppWXS() {
    const decompilationWXS = this.DecompilationWXS
    const funcHeader = 'nv_module={nv_exports:{}};';
    const funcEnd = 'return nv_module.nv_exports;}';
    const matchReturnReg = /return\s*\(\{(.|\r|\t|\n)*?\}\)/

    function functionToWXS(wxsFunc: Function) {
      let code = wxsFunc.toString()
      code = code.slice(code.indexOf(funcHeader) + funcHeader.length, code.lastIndexOf(funcEnd)).replaceAll('nv_', '')
      const matchInfo = matchReturnReg.exec(code)
      const matchList = []
      if (matchInfo) {
        matchInfo.forEach(str => str.startsWith('return') && str.endsWith('})') && matchList.push(str))
      }
      matchList.forEach(returnStr => {
        let newReturnString: string = ''
        let temp = returnStr.replace('return', '').trim()
        if (temp.startsWith('({') && temp.endsWith('})')) {
          newReturnString = `return {${temp.substring(2, temp.length - 2)}}`
          code = code.replace(returnStr, newReturnString)
        }
      })
      return jsBeautify(code)
    }

    for (const wxsPath in decompilationWXS) {   // 处理并保存 wxs 文件
      if (path.extname(wxsPath) !== '.wxs') continue
      const wxsFunc = decompilationWXS[wxsPath]
      const wxsOutputShortPath = wxsPath.replace('p_./', './').replace('m_./', './')
      const wxsString = functionToWXS(wxsFunc)
      DecompilationMicroApp.saveFile(this.pathInfo.outputResolve(wxsOutputShortPath), wxsString)
      printLog(" Completed " + ` (${wxsString.length}) \t` + colors.bold(colors.gray(wxsPath)))
    }
    const shortDecompilationWXS = {}
    for (const pathName in this.DecompilationWXS) {
      shortDecompilationWXS[pathName.replace('m_', '').replace('p_', '')] = this.DecompilationWXS[pathName]
    }
    for (const referencerOwnPath in this.wxsRefInfo) {
      const wxsInPageList = this.wxsRefInfo[referencerOwnPath]
      wxsInPageList.forEach(item => {
        let relativePath = path.relative(this.pathInfo.outputResolve(referencerOwnPath, '../'), this.pathInfo.outputResolve(item.fileSrc))
        if (item.src.includes(":")) {
          item.templateList.push(`<wxs module="${item.moduleName}">\n${functionToWXS(shortDecompilationWXS[item.src])}\n</wxs>`);
        } else {
          item.templateList.push(`<wxs module="${item.moduleName}" src="${relativePath}"/>`);
        }
      })
    }
    for (const wxmlRelativePath in this.wxsRefInfo) {
      const wxsInPageList = this.wxsRefInfo[wxmlRelativePath]
      wxsInPageList.forEach(item => {
        if (!item.templateList) return
        const wxmlAbsolutePath = this.pathInfo.resolve(wxmlRelativePath)
        const templateString = item.templateList.join('\n')
        const wxmlCode = DecompilationMicroApp.readFile(wxmlAbsolutePath)
        DecompilationMicroApp.saveFile(wxmlAbsolutePath, `${wxmlCode}\n${templateString}`, {force: true})
      })
    }
    if (Object.keys(this.wxsRefInfo).length) {
      printLog(` \u25B6 反编译所有 wxs 文件成功. \n`, {isStart: true})
    }
  }

  public async decompileAppWXML() {
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame || this.codeInfo.pageFrameHtml
    if (!code) return
    let xPool = []
    const xPoolReg = /var\s+x=\s*\[(.+)];\$?/g
    const regRes = xPoolReg.exec(code)
    if (regRes && regRes[0].includes('var x=[') && regRes[0].includes('.wxml')) {
      xPool = [regRes[1]].toString().split(',').map(str => str.replaceAll("'", ''))
    }
    const vm = DecompilationMicroApp.createVM()
    this.injectMainPackCode(vm)
    vm.run(code)
    getZ(code, (z: Record<string, any[]>) => {
      const {entrys, defines} = this.DecompilationModules
      for (let wxmlPath in entrys) {
        const result = tryDecompileWxml(entrys[wxmlPath].f.toString(), z, defines[wxmlPath], xPool)
        if (result) {
          const wxmlFullPath = this.pathInfo.outputResolve(wxmlPath)
          DecompilationMicroApp.saveFile(wxmlFullPath, result, {force: true})  // 不管文件存在或者存在默认模板， 此时通过 z 反编译出来的文件便是 wxml, 直接保存覆盖 
          printLog(` Completed  (${result.length}) \t${colors.bold(colors.gray(wxmlPath))}`)
        }
      }
    })
    await sleep(200)
    printLog(` \u25B6 反编译所有 wxml 文件成功. \n`, {isStart: true})
  }

  public async decompileAppWorker(): Promise<any> {
    await sleep(200)
    if (!fs.existsSync(this.pathInfo.workersPath)) {
      return
    }
    if (!fs.existsSync(this.pathInfo.appJsonPath)) {
      printLog(' \u274C  未能找到 app.json 文件', {isEnd: true})
      return
    }
    const appConfig: Record<any, any> = JSON.parse(DecompilationMicroApp.readFile(this.pathInfo.appJsonPath))
    let code = DecompilationMicroApp.readFile(this.pathInfo.workersPath)
    let commPath: string = '';
    let vm = DecompilationMicroApp.createVM({
      sandbox: {
        define(name: string) {
          name = path.dirname(name) + '/';
          if (!commPath) commPath = name;
          commPath = commonDir(commPath, name);
        }
      }
    })
    vm.run(code.slice(code.indexOf("define(")));
    if (commPath.length > 0) commPath = commPath.slice(0, -1);
    printLog(`Worker path:  ${commPath}`);
    appConfig.workers = commPath
    DecompilationMicroApp.saveFile(this.pathInfo.appJsonPath, JSON.stringify(appConfig, null, 2))
    printLog(` \u25B6 反编译 Worker 文件成功. \n`, {isStart: true})
  }

  /**
   * 生成组件构成必要素的默认 json wxs, wxml, wxss 文件
   * */
  public async generateDefaultAppFiles() {
    const allPageAbsolutePathList = glob.globSync(`${this.pathInfo.packRootPath}/**/*.html`).filter((str) => {
      return ![
        'page-frame.html'
      ].includes(path.basename(str))
    })
    const allPage = allPageAbsolutePathList.map(str => str.replace(this.pathInfo.packRootPath, '.'))
    const allPageAndComp = allPage.concat(this.allRefComponentList).concat(this.allSubPackagePages)
    for (let pagePath of allPageAndComp) {
      // /* json */
      // console.log(replaceExt(pagePath, ".json"), pagePath)
      let jsonPath = this.pathInfo.resolve(replaceExt(pagePath, ".json"))
      DecompilationMicroApp.saveFile(jsonPath, '{\n}');
      let jsName = replaceExt(pagePath, ".js")
      let jsPath = this.pathInfo.resolve(jsName)
      DecompilationMicroApp.saveFile(jsPath, "Page({ data: {} })");
      /* wxml */
      let wxmlName = replaceExt(pagePath, ".wxml");
      let wxmlPath = this.pathInfo.resolve(wxmlName)
      DecompilationMicroApp.saveFile(wxmlPath, `<text>${wxmlName}</text>`);
      /* js */
      /* wxss */
      // let cssName = replaceExt(pagePath, ".wxss")
      // let cssPath = this.pathInfo.resolve(cssName)
      // DecompilationMicroApp.saveFile(cssPath, "/* " + cssName + " */");
    }
    printLog(` \u25B6 生成页面和组件构成必要的默认文件成功. \n`, {isStart: true})
  }

  /**
   * 生成小程序的项目配置
   * */
  public async genProjectConfigFiles() {
    const projectPrivateConfigPath = this.pathInfo.outputResolve('project.private.config.json')
    const projectPrivateConfigData = {
      "setting": {
        "es6": false,
        "urlCheck": false
      }
    }
    DecompilationMicroApp.saveFile(projectPrivateConfigPath, JSON.stringify(projectPrivateConfigData, null, 2))
  }

  public async removeCache() {
    await sleep(500)
    let cont = 0
    const allFile = glob.globSync(`${this.pathInfo.packRootPath}/**/**{.js,.html,.json}`)
    const removeList = [
      // 'app-config.json',
      'app-wxss.js',
      'page-frame.html',
      'app-service.js',
      'appservice.app.js',
      'page-frame.js',
      'webview.app.js',
    ]
    allFile.forEach(filepath => {
      const fileName = path.basename(filepath).trim()
      const extname = path.extname(filepath)
      if (!fs.existsSync(filepath)) return
      let deleteFile = () => {
        cont++
        DecompilationMicroApp.deleteFile(filepath, {catch: true, force: true})
      }
      if (removeList.includes(fileName)) {
        deleteFile()
      } else if (extname === '.html') {
        const feature = 'var __setCssStartTime__ = Date.now()'
        const data = DecompilationMicroApp.readFile(filepath)
        if (data.includes(feature)) deleteFile()
      } else if (filepath.endsWith('.appservice.js')) {
        deleteFile()
      } else if (filepath.endsWith('.webview.js')) {
        deleteFile()
      }
    })

    if (cont) {
      printLog(`\n \u25B6 移除中间缓存产物成功, 总计 ${colors.yellow(cont)} 个`, {isStart: true})
    }
  }

  /**
   * 初始化小游戏所需环境和变量
   * */
  public async initGame() {

  }

  /**
   * 反编译 game.json 文件， 只有主包需要处理
   * */
  public async decompileGameJSON() {
    if (this.packType !== 'main') return
    await sleep(200)
    const appConfigString = this.codeInfo.appConfigJson
    const appConfig: Record<any, any> = JSON.parse(appConfigString)
    Object.assign(appConfig, appConfig.global)
    appConfig.plugins = {}
    const deleteKeys = [
      'openDataContext',
    ]
    deleteKeys.forEach(key => delete appConfig[key])

    const outputFileName = 'game.json'
    const gameConfigSaveString = JSON.stringify(appConfig, null, 2)
    DecompilationMicroApp.saveFile(this.pathInfo.outputResolve(outputFileName), gameConfigSaveString, {force: true})
    printLog(" Completed " + ` (${gameConfigSaveString.length}) \t` + colors.bold(colors.gray(this.pathInfo.outputResolve(outputFileName))))
    printLog(` \u25B6 反编译 ${outputFileName} 文件成功. \n`, {isStart: true})
  }

  /**
   * 反编译小游戏的js文件
   * */
  public async decompileGameJS() {
    const _this_game = this
    const vm = DecompilationMicroApp.createVM({
      sandbox: {
        define(name: string, func: string) {
          /* 看看是否有 polyfill,  有的话直接使用注入 polyfill */
          const foundPloyfill = _this_game.allPloyFill.find(item => {
            return name.endsWith(item.ployfillPath)
          })
          let resultGameCode: string = ''
          if (foundPloyfill) {
            resultGameCode = DecompilationMicroApp.readFile(foundPloyfill.fullPath)
          } else {
            let gameCode = func.toString();
            gameCode = gameCode.slice(gameCode.indexOf("{") + 1, gameCode.lastIndexOf("}") - 1).trim();
            resultGameCode = gameCode
            if (gameCode.startsWith('"use strict";') || gameCode.startsWith("'use strict';")) {
              gameCode = gameCode.slice(13);
            } else if ((gameCode.startsWith('(function(){"use strict";') || gameCode.startsWith("(function(){'use strict';")) && gameCode.endsWith("})();")) {
              gameCode = gameCode.slice(25, -5);
            }
            gameCode = gameCode.replaceAll('require("@babel', 'require("./@babel')
            resultGameCode = jsBeautify(gameCode);
          }
          if (resultGameCode.trim()) {
            // if (name === 'game.js') return
            DecompilationMicroApp.saveFile(_this_game.pathInfo.outputResolve(name), removeVM2ExceptionLine(resultGameCode), {force: true})
            printLog(" Completed " + ` (${resultGameCode.length}) \t` + colors.bold(colors.gray(name)))
          }
        },
        System: {
          register: () => void 0,
        },
        e: () => void 0,
        require: () => ({}),
        definePlugin: () => void 0,
        requirePlugin: () => void 0,
      }
    })
    if (this.codeInfo.gameJs) {
      try {
        this.injectMainPackCode(vm)
        vm.run(this.codeInfo.gameJs)
        printLog(` \u25B6 反编译所有 game.js 文件成功. \n`, {isStart: true})
      }catch (e) {
        
      }
    }
  }

  public async decompileAll() {
    /* 开始编译 */
    await this.init()
    // console.log(this.appType, this.packType)
    if (this.appType === 'game') {  // 小游戏
      await this.initGame()
      await this.decompileGameJSON()
      await this.decompileGameJS()
    } else { // 小程序
      await this.initApp()
      await this.decompileAppJSON()
      await this.decompileAppPageJSON()
      await this.decompileAppJS()
      await this.decompileAppWXSS()
      await this.decompileAppWXML()
      await this.decompileAppWXS()   // 解析 WXS 应该在解析完所有 WXML 之后运行
      await this.generateDefaultAppFiles()
    }
    await this.decompileAppWorker()
    await this.genProjectConfigFiles()
    await this.removeCache()
    printLog(` ✅  ${colors.bold(colors.green(this.packTypeMapping[this.packType] + '反编译结束!'))}`, {isEnd: true})
    /* 将最终运行代码同步到 web 测试文件夹 */
    if (process.env.DEV) {
      const jsPath = path.resolve('./test/js')
      if (fs.existsSync(jsPath)) fs.rmSync(jsPath, {recursive: true})
      for (const name in this._testCodeInfo) {
        const item = this._testCodeInfo[name]
        if (!item.code) continue
        DecompilationMicroApp.saveFile(item.path, item.code)
      }
    }
  }
}

