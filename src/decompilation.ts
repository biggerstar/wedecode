import type {RmOptions} from "fs";
import {VM, type VMOptions} from 'vm2'
import fs from "node:fs";
import colors from "picocolors";
import path from "node:path";
import {JSDOM} from "jsdom";
import vkbeautify from 'vkbeautify'
import {deepmerge} from "@biggerstar/deepmerge";
import {arrayDeduplication, commonDir, getPathInfo, jsBeautify, printLog, replaceExt, sleep} from "./common";
import {glob} from "glob";
import process from "node:process";
import {tryDecompileWxml} from "./lib/decompileWxml";
import {getZ} from "./lib/getZ";

/**
 * HOOK 增加的全局变量   DecompilationWXS
 * */
export class DecompilationMicroApp {
  public readonly fileList: any[]
  public pathInfo: ReturnType<typeof getPathInfo>
  public wxsList: any[]
  public packPath: string
  public packType: 'main' | 'child' | 'independent'   // 主包 | 分包 | 独立分包
  public packTypeMapping = {
    main: '主包',
    child: '分包',
    independent: '独立分包',
  }
  public codeInfo: {
    appConfigJson: string,
    appWxss: string,
    workers: string,
    pageFrame: string,
    appService: string,
  }
  public allRefComponentList: string[] = []
  public allSubPackagePages: string[] = []
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
    if (!outputPath) outputPath = path.resolve(path.dirname(inputPath), '__OUTPUT__')
    else outputPath = path.resolve(outputPath)
    this.pathInfo = getPathInfo(inputPath, outputPath)
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

  /** 保存该包中的所有文件 */
  public async unpackWxapkg() {
    const __APP_BUF__ = fs.readFileSync(this.packPath)
    const fileList = this.genFileList(__APP_BUF__)
    this.fileList.splice(0, this.fileList.length, ...fileList)
    let childRootPackNameInMainPackDir = ''
    let childRootPath = ''
    this.packType = 'child'
    for (let info of this.fileList) {
      const fileName = info.name.startsWith("/") ? info.name.slice(1) : info.name
      const data = __APP_BUF__.subarray(info.off, info.off + info.size)
      /*------------------------------------------------*/
      childRootPackNameInMainPackDir = fileName.split('/').length > 1 ? fileName.split('/')[0] : fileName // 获取主包子文件夹或者分包在主包中的第一层子文件夹名称
      const tempArr = fileName.split('/')
      tempArr.shift()
      const relativeChildPackDir = tempArr.join('/')
      childRootPath = this.pathInfo.outputResolve(childRootPackNameInMainPackDir)
      if (path.basename(fileName).includes('app-config.json')) {
        const appConfig = JSON.parse(data.toString())
        const foundSubPackages = (appConfig.subPackages || []).find((sub: any) => sub.root === `${childRootPackNameInMainPackDir}/`)
        if (!foundSubPackages) {
          this.packType = 'main'
        } else if (typeof foundSubPackages === 'object' && foundSubPackages['independent']) {
          this.packType = 'independent'
        }
      }
      DecompilationMicroApp.saveFile(path.resolve(childRootPath, relativeChildPackDir), data)
      /*------------------------------------------------*/
    }
    // console.log(this.packType)
    if (this.packType === 'main') {
      this.pathInfo.setPackRootPath(this.pathInfo.outputPath)
    } else {
      if (!childRootPath) {
        throw new Error('\u274C 解析分包错误')
      }
      this.pathInfo.setPackRootPath(childRootPath)
    }
    printLog(`\n \u25B6 解小程序压缩包成功! 文件总数: ${colors.green(this.fileList.length)}`, {isStart: true})
  }

  /**
   * 初始化, 所有后续反编译且不会被动态改变的所需要的信息都在这里加载
   * 记住一个准则： 读取都使用 packRootPath 路径， 保存都使用 outputPath 路径
   * */
  public async init() {
    await this.unpackWxapkg()
    printLog(` \u25B6 当前反编译目标 (${colors.yellow(this.packTypeMapping[this.packType])}) : ` + colors.blue(this.packPath));
    printLog(` \u25B6 当前输出目录:  ${colors.blue(this.pathInfo.outputPath)}\n`, {
      isEnd: true,
    });
    this.codeInfo = {
      appConfigJson: DecompilationMicroApp.readFile(this.pathInfo.appConfigJsonPath),
      appWxss: DecompilationMicroApp.readFile(this.pathInfo.appWxssPath),
      appService: DecompilationMicroApp.readFile(this.pathInfo.appServicePath),
      pageFrame: DecompilationMicroApp.readFile(this.pathInfo.pageFramePath),
      workers: DecompilationMicroApp.readFile(this.pathInfo.workersPath),
    }
    const loadInfo = {}
    for (const name in this.codeInfo) {
      loadInfo[name] = this.codeInfo[name].length
    }
    // console.log({...this.pathInfo})
    console.log(loadInfo)
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame
    if (!code) return
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

      this.allSubPackagePages = appConfig.subPackages
        .map((subPackage: any) => appConfig.pages.filter((pagePath: string) => pagePath.startsWith(subPackage.root)))
        .flat(2)
    }
  }

  /**
   * 解析出 app.json 文件， 只有主包需要处理
   * */
  public async decompileAppJSON() {
    if (this.packType === 'child') return
    await sleep(200)
    const appConfigString = this.codeInfo.appConfigJson
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

    DecompilationMicroApp.saveFile(this.pathInfo.outputResolve('app.json'), JSON.stringify(appConfig, null, 2), {force: true})
    printLog(` \u25B6 反编译 app.json 文件成功. \n`, {isStart: true})
  }

  /**
   * 处理子包 json，只需要处理主包， 子包解压自带 json
   * */
  public async decompileJSON() {
    if (this.packType === 'child') return
    const appConfig: Record<any, any> = JSON.parse(this.codeInfo.appConfigJson)
    for (let pageHtmlPath in appConfig.page) {
      const pageJsonConfig = appConfig.page[pageHtmlPath]
      const pageJsonPath = pageHtmlPath.replace('.html', '.json')
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
        delete realJsonConfig.rendererOptions?.['skyline']['disableABTest']
        delete realJsonConfig.rendererOptions?.['skyline']['sdkVersionBegin']
        delete realJsonConfig.rendererOptions?.['skyline']['sdkVersionEnd']
      }
      DecompilationMicroApp.saveFile(this.pathInfo.outputResolve(pageJsonPath), JSON.stringify(realJsonConfig, null, 2))
    }
    printLog(` \u25B6 反编译所有 page json 文件成功. \n`, {isStart: true})
  }

  public async decompileJS() {
    const _this = this
    const code = this.codeInfo.appService
    const vm = DecompilationMicroApp.createVM({
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
            DecompilationMicroApp.saveFile(_this.pathInfo.outputResolve(name), beautifyCode)
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
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame
    if (!code.trim()) return
    const vm = DecompilationMicroApp.createVM()
    vm.run(code)
    const __wxAppCode__ = vm.sandbox['__wxAppCode__']
    if (!__wxAppCode__) return
    Object.keys(__wxAppCode__).forEach(filepath => path.extname(filepath) === '.wxss' && __wxAppCode__[filepath]())
    const allHeadElement: HTMLStyleElement[] = Array.from(vm.sandbox.window.document.head.children)
    allHeadElement.forEach(styleEl => {
      const attr = styleEl.attributes.getNamedItem('wxss:path')
      if (!attr) return
      const outPath = attr.value
      const cssText = styleEl.innerHTML
      if (cssText && outPath && outPath !== 'undefined') {
        DecompilationMicroApp.saveFile(this.pathInfo.outputResolve(outPath), vkbeautify.css(cssText))
        printLog(" Completed " + colors.bold(colors.gray(outPath)))
      }

    })
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
      DecompilationMicroApp.saveFile(this.pathInfo.outputResolve(wxsOutputShortPath), functionToWXS(wxsFunc))
      printLog(" Completed " + colors.bold(colors.gray(wxsPath)))
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
          item.templateList.push(`<wxs module="${item.moduleName}>"\n${functionToWXS(shortDecompilationWXS[item.src])}\n</wxs>`);
        } else {
          item.templateList.push(`<wxs module="${item.moduleName}" src="${relativePath}"/>`);
        }
      })
    }
    printLog(` \u25B6 反编译所有 wxs 文件成功. \n`, {isStart: true})
  }

  public async decompileWXML() {
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame
    if (!code) return
    const vm = DecompilationMicroApp.createVM()
    vm.run(code)
    getZ(code, (z: Record<string, any[]>) => {
      const {entrys, defines} = this.DecompilationModules
      for (let wxmlPath in entrys) {
        const result = tryDecompileWxml(entrys[wxmlPath].f.toString(), z, defines[wxmlPath])
        if (result) {
          DecompilationMicroApp.saveFile(this.pathInfo.outputResolve(wxmlPath), result)
          printLog(` Completed  ${colors.bold(colors.gray(wxmlPath))}`)
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
    let vm = DecompilationMicroApp.createVM({
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
      let jsName = replaceExt(pagePath, ".js")
      let jsPath = this.pathInfo.resolve(jsName)
      DecompilationMicroApp.saveFile(jsPath, "// " + jsName + "\nPage({data: {}})");
      /* wxml */
      let wxmlName = replaceExt(pagePath, ".wxml");
      let wxmlPath = this.pathInfo.resolve(wxmlName)
      DecompilationMicroApp.saveFile(wxmlPath, "<!--" + wxmlName + "--><text>" + wxmlName + "</text>");
      // /* json */
      let jsonPath = this.pathInfo.resolve(replaceExt(pagePath, ".json"))
      DecompilationMicroApp.saveFile(jsonPath, '{\n\n}');
      /* js */
      /* wxss */
      // let cssName = replaceExt(pagePath, ".wxss")
      // let cssPath = this.pathInfo.resolve(cssName)
      // DecompilationMicroApp.saveFile(cssPath, "/* " + cssName + " */");
    }
    printLog(` \u25B6 生成页面和组件构成必要的默认文件成功. \n`, {isStart: true})
  }

  public async removeCache() {
    await sleep(500)
    let cont = 0
    const allFile = glob.globSync(`${this.pathInfo.packRootPath}/**/**{.js,.html,.json}`)
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

  public async decompileAll() {
    /* 开始编译 */
    await this.init()
    await this.decompileAppJSON()
    await this.decompileJSON()
    await this.decompileJS()
    await this.decompileWXSS()
    await this.decompileWorker()
    await this.decompileWXML()
    await this.decompileWXS()
    await this.generateDefaultFiles()
    await this.removeCache()
    printLog(` ✅  ${colors.bold(colors.green('反编译成功!'))}  ${colors.gray(this.pathInfo.outputPath)}\n`, {isEnd: true})
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

