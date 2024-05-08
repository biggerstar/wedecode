import type {RmOptions} from "fs";
import {VM, type VMOptions} from 'vm2'
import fs from "node:fs";
import colors from "picocolors";
import path from "node:path";
import {JSDOM} from "jsdom";
import vkbeautify from 'vkbeautify'
import {deepmerge} from "@biggerstar/deepmerge";
import {arrayDeduplication, commonDir, getPathInfo, jsBeautify, printLog, replaceExt, sleep} from "./common";
import {glob, globSync} from "glob";
import process from "node:process";
import {tryWxml} from "./lib/decompileWxml";
import {getZ} from "./lib/getZ";

/**
 * HOOK 增加的全局变量   DecompilationWXS  DecompilationModules
 * */
export class DecompilationMicroApp {
  public readonly fileList: any[]
  public pathInfo: ReturnType<typeof getPathInfo>
  public wxsList: any[]
  public packPath: string
  public packType: 'main' | 'child'   // 主包还是分包
  public allRefComponentList: string[] = []
  public allSubPackagePages: string[] = []
  public outputPath: string   // 指定输出目录， 分解多包的时候， 该地址正常指定为主包目录
  public DecompilationModules: {
    modules: Record<string, Record<any, any> | Function>
    defines: Record<any, Record<any, any>>
    entrys: Record<string, { f: Function, j: any[], i: any[], ti: any[], ic: any[] }>
  }
  public DecompilationWXS: Record<string, Function>
  public wxsRefInfo: Record<string, {
    vSrc?: string,
    src: string,
    fileSrc: string,
    moduleName?: string,
    templateList?: string[]
  }[]> = {}
  private readonly _testCodeInfo: Record<'appService' | 'appWxss' | 'pageFrame', { path: string, code: string }>

  constructor(inputPath: string, outputPath?: string) {
    this.pathInfo = getPathInfo(inputPath, outputPath)
    this.outputPath = outputPath
    this.fileList = []
    this.packPath = inputPath
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

  /** 保存该包中的所有文件 */
  public async unpackWxapkg() {
    const __APP_BUF__ = fs.readFileSync(this.packPath)
    const fileList = this.genFileList(__APP_BUF__)
    this.fileList.splice(0, this.fileList.length, ...fileList)
    for (let info of this.fileList) {
      const fileName = info.name.startsWith("/") ? info.name.slice(1) : info.name
      const data = __APP_BUF__.subarray(info.off, info.off + info.size)
      DecompilationMicroApp.saveFile(this.pathInfo.resolve(fileName), data)
    }
    this.packType = fs.existsSync(this.pathInfo.appConfigJsonPath) ? 'main' : 'child'
    const subPackList = glob.globSync(`${this.pathInfo.packRootPath}/**/page-frame.js`)
    if (subPackList.length) this.pathInfo = getPathInfo(path.dirname(subPackList[0]))  // 重定向路径信息到子包解压后的根目录
    printLog(`\n \u25B6 解小程序压缩包成功! 文件总数: ${colors.green(this.fileList.length)}`, {isStart: true})
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
    if (firstMark !== 0xbe || lastMark !== 0xed) throw Error("Magic number is not correct!");

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

  public static deleteFile(path: string, opt: RmOptions & { catch?: boolean } = {}): void {
    try {
      fs.rmSync(path, opt)
    } catch (e) {
      if (!opt.catch) throw e
    }
  }

  /**
   * @param {string} filepath
   * @param {any} data
   * @param {Object} opt
   * @param {boolean} opt.force 强制覆盖
   * @param {boolean} opt.emptyInstead 如果文原始件为空则直接替代
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

  public createVM(vmOptions: VMOptions = {}) {
    const domBaseHtml = `<!DOCTYPE html><html lang="en"><head></head><body></body></html>`
    const dom = new JSDOM(domBaseHtml);
    const vm_window = dom.window
    const vm_navigator = dom.window.navigator
    const vm_document = dom.window.document
    return new VM(deepmerge({
      sandbox: {
        window: vm_window,
        navigator: vm_navigator,
        document: vm_document,
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

  public async removeCache() {
    await sleep(500)
    let cont = 0
    const allFile = glob
      .globSync(`${this.pathInfo.packRootPath}/**/**{.js,.html,.json}`)
    const removeList = [
      // 'app-config.json',
      'app-wxss.js',
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

  public async init() {
    printLog(` \u25B6 当前反编译目标 (${colors.yellow(this.packType === 'main' ? '主包' : '分包')}) : ` + colors.blue(this.packPath), {
      isEnd: true,
      interceptor: (log) => {
        return !(log.includes('Completed') || log.includes('反编译所有'))
      }
    });
    printLog(` \u25B6 当前输出目录:  ${colors.blue(this.outputPath)}\n`, {
      isEnd: true,
    });
    const foundInfo = DecompilationMicroApp.readFileUntilContainContent([this.pathInfo.appWxssPath, this.pathInfo.pageFramePath])
    if (!foundInfo.found) return
    let code = foundInfo.data
    const vm = this.createVM()
    code = code.replaceAll('var e_={}', `var e_ = {}; window.DecompilationModules = global;`)
    code = code.replace(
      'var nom={};return function(n){',
      'var nom={}; window.DecompilationWXS = nnm; return function(n){ var keepPath = n; '
    ).replace(
      'return function(){if(!nnm[n])',
      'return function(){ if (window.isHookReady){ return keepPath }; if(!nnm[n])'
    )
    code = code + ';window.isHookReady = true'
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

    if (this.packType === 'main') {
      const appConfig: Record<any, any> = JSON.parse(DecompilationMicroApp.readFile(this.pathInfo.appConfigJsonPath))
      const allPageJsonConfig = appConfig.page
      this.allRefComponentList = arrayDeduplication(Object.keys(allPageJsonConfig || {})
        .map((pagePath: any) => {
          // console.log(this.pathInfo.resolve(pagePath));
          const pageInfo = allPageJsonConfig[pagePath]
          const allRefComponents: string[] = Object.values(pageInfo?.window?.['usingComponents'] || {})
          return allRefComponents.map(compRelativePath => {
            return `.${path.resolve(path.relative(this.pathInfo.resolve(pagePath), compRelativePath))}`
          })
        })
        .flat(2))

      this.allSubPackagePages = appConfig.subPackages
        .map((subPackage: any) => appConfig.pages.filter((pagePath: string) => pagePath.startsWith(subPackage.root)))
        .flat(2)
    }
  }

  public async decompileAppJSON() {
    if (this.packType === 'child') return
    const configFilePath = this.pathInfo.appJsonPath
    await sleep(200)
    const appConfigString = DecompilationMicroApp.readFile(this.pathInfo.appConfigJsonPath)
    const appConfig: Record<any, any> = JSON.parse(appConfigString)
    appConfig.window = appConfig.global.window || {}
    delete appConfig.global
    delete appConfig.page
    appConfig.plugins = {}
    if (appConfig.subPackages) {
      let subPackages = [];
      appConfig.subPackages.forEach((subPackage: Record<any, any>) => {
        let root = subPackage.root;
        let newPages = [];
        root = !String(root).endsWith('/') ? root + '/' : root
        root = String(root).startsWith('/') ? root.substring(1) : root
        for (let pageString of appConfig.pages) {
          if (pageString.startsWith(root)) {
            newPages.push(pageString.replace(root, ''));
          }
        }
        subPackage.root = root;
        subPackage.pages = newPages;
        delete subPackage.plugins
        subPackages.push(subPackage);
      })
      subPackages = subPackages.filter(sub => (sub.pages || []).length > 0)
      if (Object.keys(subPackages).length >= 100) {
        console.log(` ▶ ${colors.red('程序主动结束编译, 因为 subPackages 包个数超过限制 100, 超过微信限制')}`)
        process.exit()
      }
      appConfig.subPackages = subPackages;
    }
    appConfig.pages = arrayDeduplication<string>(appConfig.pages, (_, cur) => !this.allSubPackagePages.includes(cur))
    if (appConfig.entryPagePath) appConfig.entryPagePath = appConfig.entryPagePath.replace('.html', '')
    if (appConfig.renderer) {
      appConfig.renderer = appConfig.renderer.default || 'webview'
    }

    if (appConfig.extAppid)
      DecompilationMicroApp.saveFile(this.pathInfo.resolve('ext.json'), JSON.stringify({
        extEnable: true,
        extAppid: appConfig.extAppid,
        ext: appConfig.ext
      }, null, 2))

    if (appConfigString.includes('"renderer": "skyline"') || appConfigString.includes('"renderer":"skyline"')) {
      appConfig.lazyCodeLoading = "requiredComponents"
      delete appConfig.window.navigationStyle
      delete appConfig.window.navigationBarTextStyle
      delete appConfig.window.navigationBarTitleText
      delete appConfig.window.navigationBarBackgroundColor
    }

    if (appConfig.tabBar) {
      if (!appConfig.tabBar.list) appConfig.tabBar.list = []
      const allDecompilationBeforeFileList = glob.globSync(`${this.pathInfo.packRootPath}/**`)
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
          if (found) result.iconPath = path.relative(this.pathInfo.packRootPath, found.path)
        }
        if (info.selectedIconData) {
          const found = allFileBufferInfo.find(item => item.data === info.selectedIconData)
          if (found) result.selectedIconPath = path.relative(this.pathInfo.packRootPath, found.path)
        }
        return result
      })
    }

    DecompilationMicroApp.saveFile(configFilePath, JSON.stringify(appConfig, null, 2), {force: true})
    printLog(` \u25B6 反编译 app.json 文件成功. \n`, {isStart: true})
  }

  public async decompileJSON() {
    if (this.packType === 'child') return
    const appConfig: Record<any, any> = JSON.parse(DecompilationMicroApp.readFile(this.pathInfo.appConfigJsonPath))
    for (let pageHtmlPath in appConfig.page) {
      const pageJsonConfig = appConfig.page[pageHtmlPath]
      const pageJsonPath = pageHtmlPath.replace('.html', '.json')
      const realJsonConfig: Record<any, any> = pageJsonConfig.window || {}
      delete realJsonConfig.enableFSTCollect
      delete realJsonConfig.enableFSPCollect
      delete realJsonConfig.fstIgnoredClassNames
      delete realJsonConfig.enableFSPImageCollect
      delete realJsonConfig.hideCapsuleButtons
      delete realJsonConfig.rendererType
      delete realJsonConfig.widgetBackgroundColor
      delete realJsonConfig.enablePageScroll
      realJsonConfig.backgroundColorTop = realJsonConfig.backgroundTopColor
      delete realJsonConfig.backgroundTopColor
      delete realJsonConfig.enableBeforeUnload
      delete realJsonConfig.alipayStyleIsolation
      delete realJsonConfig.fstContainerId
      delete realJsonConfig.__warning__
      delete realJsonConfig.sdkVersionEnd
      delete realJsonConfig.window
      delete realJsonConfig.initialRenderingSnapshot
      if (realJsonConfig.rendererOptions?.['skyline']) {
        delete realJsonConfig.rendererOptions?.['skyline']['disableABTest']
        delete realJsonConfig.rendererOptions?.['skyline']['sdkVersionBegin']
        delete realJsonConfig.rendererOptions?.['skyline']['sdkVersionEnd']
      }
      DecompilationMicroApp.saveFile(this.pathInfo.resolve(pageJsonPath), JSON.stringify(realJsonConfig, null, 2))
    }
    printLog(` \u25B6 反编译所有 page json 文件成功. \n`, {isStart: true})
  }

  public async decompileJS() {
    const _this = this
    const code = DecompilationMicroApp.readFile(this.pathInfo.resolve("app-service.js"))
    const vm = this.createVM({
      sandbox: {
        define(name: string, func: string) {
          let code = func.toString();
          code = code.slice(code.indexOf("{") + 1, code.lastIndexOf("}") - 1).trim();
          let bcode = code;
          if (code.startsWith('"use strict";') || code.startsWith("'use strict';")) {
            code = code.slice(13);
          } else if ((code.startsWith('(function(){"use strict";') || code.startsWith("(function(){'use strict';")) && code.endsWith("})();")) {
            code = code.slice(25, -5);
          }
          code = code.replaceAll('require("@babel', 'require("./@babel')

          let beautifyCode = jsBeautify(code);
          if (typeof beautifyCode == "undefined") {
            beautifyCode = jsBeautify(bcode);
          }
          if (beautifyCode.trim()) {
            DecompilationMicroApp.saveFile(_this.pathInfo.resolve(name), beautifyCode)
            printLog(" Completed " + colors.bold(colors.gray(name)))
          }
        },
        require: () => void 0,
        definePlugin: () => void 0,
        requirePlugin: () => void 0,
      }
    })
    if (code) {
      vm.run(code)
      printLog(` \u25B6 反编译所有 js 文件成功. \n`, {isStart: true})
    }
  }

  public async decompileWXSS() {
    const foundInfo = DecompilationMicroApp.readFileUntilContainContent([this.pathInfo.appWxssPath, this.pathInfo.pageFramePath])
    if (!foundInfo.found) return
    let code = foundInfo.data
    if (!code.trim()) return
    const vm = this.createVM()
    vm.run(code)
    const __wxAppCode__ = vm.sandbox['__wxAppCode__']
    if (!__wxAppCode__) return
    for (const filepath in __wxAppCode__) {
      // printLog(filepath)
      if (path.extname(filepath) !== '.wxss') continue
      __wxAppCode__[filepath]()
      const headList: HTMLElement[] = Array.from(vm.sandbox.window.document.head.children)
      const curStyleElement = headList[0]
      const data = curStyleElement.innerHTML.toString()
      if (data) {
        DecompilationMicroApp.saveFile(this.pathInfo.resolve(filepath), vkbeautify.css(curStyleElement.innerHTML.toString()))
        printLog(" Completed " + colors.bold(colors.gray(filepath)))
      }
      headList.forEach(node => node.remove())
    }
    printLog(` \u25B6 反编译所有 wxss 文件成功. \n`, {isStart: true})
  }

  public async decompileWXS() {
    const decompilationWXS = this.DecompilationWXS
    const funcHeader = 'nv_module={nv_exports:{}};';
    const funcEnd = 'return nv_module.nv_exports;}';

    function functionToWXS(wxsFunc: Function) {
      let code = wxsFunc.toString()
      code = code.slice(code.indexOf(funcHeader) + funcHeader.length, code.lastIndexOf(funcEnd)).replaceAll('nv_', '')
      return jsBeautify(code)
    }

    for (const wxsPath in decompilationWXS) {   // 处理输出 wxs 文件
      if (path.extname(wxsPath) !== '.wxs') continue
      const wxsFunc = decompilationWXS[wxsPath]
      const wxsOutputShortPath = wxsPath.replace('p_./', './').replace('m_./', './')
      DecompilationMicroApp.saveFile(this.pathInfo.resolve(wxsOutputShortPath), functionToWXS(wxsFunc))
      printLog(" Completed " + colors.bold(colors.gray(wxsPath)))
    }
    const shortDecompilationWXS = {}
    for (const pathName in this.DecompilationWXS) {
      shortDecompilationWXS[pathName.replace('m_', '').replace('p_', '')] = this.DecompilationWXS[pathName]
    }
    for (const referencerOwnPath in this.wxsRefInfo) {
      const wxsInPageList = this.wxsRefInfo[referencerOwnPath]
      wxsInPageList.forEach(item => {
        let relativePath = path.relative(this.pathInfo.resolve(referencerOwnPath, '../'), this.pathInfo.resolve(item.fileSrc))
        if (item.src.includes(":")) {
          item.templateList.push(`<wxs module="${item.moduleName}>"\n${functionToWXS(shortDecompilationWXS[item.src])}\n</wxs>`);
        } else {
          item.templateList.push(`<wxs module="${item.moduleName}" src="${relativePath}"/>`);
        }
      })
    }
    printLog(` \u25B6 反编译所有 wxs 文件成功. \n`, {isStart: true})
  }


  public async decompileWXML() {
    const foundInfo = DecompilationMicroApp.readFileUntilContainContent([this.pathInfo.appWxssPath, this.pathInfo.pageFramePath])
    if (!foundInfo.found) return
    let code = foundInfo.data
    const vm = this.createVM()
    code = code.replaceAll('var e_={}', `var e_ = {}; window.DecompilationModules = global`)
    vm.run(code);
    // console.log(code)
    getZ(code, (z) => {
      const {entrys, defines} = this.DecompilationModules
      for (let name in entrys) {
        const success = tryWxml(this.outputPath, name, entrys[name].f.toString(), z, defines[name])
        if (success) {
          printLog(` Completed  ${colors.bold(colors.gray(name))}`)
        }
      }
    })
    await sleep(200)
    printLog(` \u25B6 反编译所有 wxml 文件成功. \n`, {isStart: true})
  }

  public async decompileWorker(): Promise<any> {
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
    let vm = this.createVM({
      sandbox: {
        require() {
        },
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
  public async generateDefaultFiles() {
    const allPageAbsolutePathList = glob.globSync(`${this.pathInfo.packRootPath}/**/*.html`)
    const allPage = allPageAbsolutePathList.map(str => str.replace(this.pathInfo.packRootPath, '.'))
    const allPageAndComp = allPage.concat(this.allRefComponentList).concat(this.allSubPackagePages)
    for (let pagePath of allPageAndComp) {
      let jsPath = this.pathInfo.resolve(replaceExt(pagePath, ".js"))
      DecompilationMicroApp.saveFile(jsPath, "// " + jsPath + "\nPage({data: {}})");
      /* wxml */
      let wxmlName = replaceExt(pagePath, ".wxml");
      let wxmlPath = this.pathInfo.resolve(wxmlName)
      DecompilationMicroApp.saveFile(wxmlPath, "<!--" + wxmlName + "--><text>" + wxmlName + "</text>");
      // /* json */
      let jsonPath = this.pathInfo.resolve(replaceExt(pagePath, ".json"))
      DecompilationMicroApp.saveFile(jsonPath, '{\n\n}');
      /* js */
      /* wxss */
      let cssName = replaceExt(pagePath, ".wxss")
      let cssPath = this.pathInfo.resolve(cssName)
      // DecompilationMicroApp.saveFile(cssPath, "/* " + cssName + " */");
    }
    printLog(` \u25B6 生成页面和组件构成必要的默认文件成功. \n`, {isStart: true})
  }

  public async decompileAll() {
    /* 开始编译 */
    await this.unpackWxapkg()
    await this.init()
    await this.decompileAppJSON()
    await this.decompileJSON()
    await this.decompileJS()
    await this.decompileWXSS()
    await this.decompileWorker()
    await this.decompileWXS()
    await this.decompileWXML()
    await this.generateDefaultFiles()
    // await this.removeCache()
    printLog(` ✅  ${colors.bold(colors.green('反编译成功!'))}  ${colors.gray(this.pathInfo.packRootPath)}\n`, {isEnd: true})
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

