import {VM} from 'vm2'
import fs from "node:fs";
import colors from "picocolors";
import path from "node:path";
import {glob} from "glob";
import process from "node:process";
import cssbeautify from "cssbeautify";
import {BaseDecompilation} from "./BaseDecompilation";
import {createVM} from "@/utils/createVM";
import {readLocalFile, saveLocalFile} from "@/utils/fs-process";
import {appJsonExcludeKeys, pluginDirRename} from "@/constant";
import {getZ} from "@/utils/getZ";
import {tryDecompileWxml} from "@/utils/decompileWxml";
import {AppCodeInfo, ModuleDefine, UnPackInfo} from "@/type";
import {
  arrayDeduplication,
  getParameterNames,
  isPluginPath, isWxAppid,
  jsBeautify,
  printLog, replaceExt, resetWxsRequirePath,
  sleep
} from "@/utils/common";
import {getAppPackCodeInfo} from "@/utils/getPackCodeInfo";
import {JSDOM} from "jsdom";
import {isDev} from "@/bin/wedecode/enum";

/**
 * 反编译小程序
 * */
export class AppDecompilation extends BaseDecompilation {
  private codeInfo: AppCodeInfo
  private allSubPackagePages: string[] = []
  /**
   *
   * */
  private allRefComponentList: string[] = []
  /**
   * 不包含插件的所有各种的模块定义
   * */
  private DecompilationModules?: ModuleDefine
  /**
   * 所有插件的所有各种的模块定义
   * */
  private readonly WXML_PLUGINS: Record<string, ModuleDefine> = {}
  private DecompilationWXS?: Record<string, Function>
  /**
   * 是否将第三方的远程插件转换变成本地离线使用
   * */
  public convertPlugin: boolean = false
  private readonly wxsRefInfo: Record<string, {
    vSrc?: string,
    src: string,
    fileSrc: string,
    moduleName?: string,
    templateList?: string[]
  }[]> = {}

  /**
   * 所有在 page.json 中被引用的组件
   * */

  public constructor(packInfo: UnPackInfo) {
    super(packInfo);
  }

  /**
   * 初始化, 所有后续反编译且不会被动态改变的所需要的信息都在这里加载
   * 记住一个准则： 读取都使用 packRootPath 路径， 保存都使用 outputPath 路径
   * */
  private async initApp() {
    this.codeInfo = getAppPackCodeInfo(this.pathInfo)

    //  用户 polyfill
    const loadInfo = {}
    for (const name in this.codeInfo) {
      loadInfo[name] = this.codeInfo[name].length
    }
    console.log(loadInfo)
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame || this.codeInfo.pageFrameHtml
    if (!code) {
      if (this.packType === 'main') {
        console.log(colors.red('\u274C  没有找到包特征文件'))
      }
      return
    }
    const vm = createVM()
    code = code
      .replaceAll(
        'var e_={}',
        `var e_ = {}; window.DecompilationModules = global;`
      )
      .replace(
        'var nom={};return function(n){',
        'var nom={}; window.DecompilationWXS = nnm; return function(n){ var keepPath = n; '
      )
      .replace(
        'return function(){if(!nnm[n])',
        'return function(){ if (window.isHookReady){ return keepPath }; if(!nnm[n])'
      )
    code = code + ';window.isHookReady = true'
    vm.run(code)
    this.DecompilationModules = {...vm.sandbox.window['DecompilationModules']} || {}
    this.DecompilationWXS = {...vm.sandbox.window['DecompilationWXS']} || {}
    for (const name in vm.sandbox) {
      vm.sandbox.__wxAppCode__ = {}
      const global = {}
      if (name.startsWith('$gwx_wx')) { // 插件处理
        const appId = name.replace('$gwx_', '') // 插件APPID
        if (!isWxAppid(appId)) {
          continue
        }
        const func = vm.sandbox[name]
        try {
          // 将所有的 $gwx_  加载到 global 对象中， window.DecompilationModules 是 global 的引用
          func(void 0, global)
          this.WXML_PLUGINS[appId] = global as any
        } catch (e) {
        }
      }
    }
    for (const filepath in this.DecompilationModules.modules) {
      if (path.extname(filepath) !== '.wxml') continue
      const wxmlRefWxsMap = this.DecompilationModules.modules[filepath]
      if (!this.wxsRefInfo[filepath]) this.wxsRefInfo[filepath] = []
      for (const moduleName in wxmlRefWxsMap) {
        const vSrc = wxmlRefWxsMap[moduleName]()
        if (typeof vSrc === 'string') {
          const src: string = resetWxsRequirePath(vSrc, './')
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
  private async decompileAppJSON() {
    if (this.packType !== 'main') return
    await sleep(200)
    const appConfigString = this.codeInfo.appConfigJson
    const appConfig: Record<any, any> = JSON.parse(appConfigString)
    Object.assign(appConfig, appConfig.global)
    delete appConfig.global
    delete appConfig.page
    if (appConfig.entryPagePath) appConfig.entryPagePath = appConfig.entryPagePath.replace('.html', '')
    if (appConfig.renderer) {
      appConfig.renderer = appConfig.renderer.default || 'webview'
    }

    if (appConfig.extAppid) {
      saveLocalFile(this.pathInfo.outputResolve('ext.json'), JSON.stringify({
        extEnable: true,
        extAppid: appConfig.extAppid,
        ext: appConfig.ext
      }, null, 2))
    }

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
            data: readLocalFile(filePath, 'base64'),
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
    if (this.convertPlugin) {
      appConfig.plugins = {} // 插件从远程替换成本地编译使用
    }
    appJsonExcludeKeys.forEach(key => delete appConfig[key])
    const outputFileName = 'app.json'
    const appConfigSaveString = JSON
      .stringify(appConfig, null, 2)
      .replaceAll(pluginDirRename[0], pluginDirRename[1]) // 插件换名， 因为官方禁止反编译 __ 开头 目录
    saveLocalFile(this.pathInfo.outputResolve(outputFileName), appConfigSaveString, {force: true})
    printLog(" Completed " + ` (${appConfigSaveString.length}) \t` + colors.bold(colors.gray(this.pathInfo.outputResolve(outputFileName))))
    printLog(` \u25B6 反编译 ${outputFileName} 文件成功. \n`, {isStart: true})
  }

  /**
   * 处理子包 json，只需要处理主包， 子包解压自带 json
   * */
  private async decompileAllJSON() {
    const plugins: Record<string, Function> = {}
    const vm = createVM({
      sandbox: {
        definePlugin: function (pluginName: string, pluginFunc: Function) {
          plugins[pluginName] = pluginFunc
        },
      }
    })
    vm.run(this.codeInfo.appService)
    // 解析代码中的各个模块  json 配置
    this._injectPluginAppPageJSON(vm, plugins) // 要在解析 __wxAppCode__ 之前将插件的page.json配置注入 __wxAppCode__
    const __wxAppCode__ = Object.assign(vm.sandbox.__wxAppCode__, vm.sandbox.global?.__wxAppCode__ || {});
    for (const filePath in __wxAppCode__) {
      if (path.extname(filePath) !== '.json') continue
      let tempFilePath = filePath
      const pageJson = __wxAppCode__[filePath]
      let realJsonConfigString = JSON.stringify(pageJson, null, 2)
      let jsonOutputPath = filePath
      if (isPluginPath(filePath)) {
        tempFilePath = path.join(pluginDirRename[0], filePath.replace('plugin-private://', ''))
        jsonOutputPath = `${this.pathInfo.packRootPath}/${tempFilePath}`
      }
      // console.log(jsonOutputPath)
      printLog(" Completed " + ` (${realJsonConfigString.length}) \t` + colors.bold(colors.gray(jsonOutputPath)))
      saveLocalFile(this.pathInfo.outputResolve(jsonOutputPath), realJsonConfigString, {force: true})
    }
    printLog(` \u25B6 反编译所有 page json 文件成功. \n`, {isStart: true})
  }

  /**
   * 将 json 信息注入沙箱 __wxAppCode__ 中
   * */
  private _injectPluginAppPageJSON(vm: VM, plugins: Record<string, Function>) {
    const sandBox = vm.sandbox
    // 反编译插件的 JS 代码
    for (const pluginName in plugins) {
      const global = {
        __wxAppCode__: {},
        publishDomainComponents() {
        },
      }
      const pluginFunc = plugins[pluginName]
      const paramNameList = getParameterNames(pluginFunc)
      const paramValueList = paramNameList.map((name: string) => {
        if (name === 'global') return global
        return sandBox[name] || sandBox.window[name]
      })
      pluginFunc.apply(sandBox.window, paramValueList)
      Object.assign(sandBox.__wxAppCode__, global.__wxAppCode__)
    }
  }

  private async decompileAppJS() {
    const _this = this
    const plugins: Record<string, Function> = {}
    const sandbox = {
      require() {
      },
      define(name: string, func: Function) {
        _this._parseJsDefine(name, func)
      },
      definePlugin: function (pluginName: string, pluginFunc: Function) {
        plugins[pluginName] = pluginFunc
      },
    }
    let appServiceCode = this.codeInfo.appService
    if (appServiceCode) {
      const vm = createVM()
      Object.assign(vm.sandbox, sandbox) // 将沙箱函数替换回来， 下方同理
      appServiceCode = appServiceCode
        .replaceAll('=__webnode__.define;', ';')
        .replaceAll('=__webnode__.require;', ';')
      vm.run(appServiceCode)
      Object.assign(vm.sandbox, sandbox)
      this._decompilePluginAppJS(vm, plugins)
      printLog(` \u25B6 反编译所有 js 文件成功. \n`, {isStart: true})
    }
  }

  /**
   * 反编译插件 JS 代码
   * */
  private _decompilePluginAppJS(vm: VM, plugins: Record<string, Function>) {
    const sandBox = vm.sandbox
    const mainEnvDefine = sandBox.define
    const _this = this
    sandBox.global = sandBox.window;
    let pluginDefine: Function
    // 反编译插件的 JS 代码
    for (const pluginName in plugins) {
      const appid = pluginName.replace('plugin://', '')
      pluginDefine = function (name: string, func: string) {
        const pluginPath = path.relative(
          _this.pathInfo.outputPath,
          _this.pathInfo.resolve(`${pluginDirRename[0]}/${appid}/${name}`)
        )
        mainEnvDefine(pluginPath, func)
      }
      const pluginFunc = plugins[pluginName]
      const paramNameList = getParameterNames(pluginFunc)
      const paramValueList = paramNameList.map((name: string) => {
        if (name === 'define') return pluginDefine
        return sandBox[name] || sandBox.window[name] || sandBox.window.document[name]
      })
      // console.log(pluginName, getParameterNames(pluginFunc));
      pluginFunc.apply(sandBox.window, paramValueList)
    }
  }

  private _setCssToHead(arr: any[], _invalid: any, opt?: { path: string, suffix?: string }) {
    if (typeof opt === 'object' && opt.path && Array.isArray(arr)) {
      let cssPath = opt.path
      const isPlugin = isPluginPath(cssPath)
      if (isPlugin) { // 解析插件，重定向到插件所在路径
        // 将插件路径重定向到主包 或者 分包所在路径
        cssPath = cssPath.replace(
          'plugin-private://',
          `${this.pathInfo.packRootPath}/${pluginDirRename[0]}/`
        )
      }
      arr = arr.map((item) => {
        if (Array.isArray(item)) {
          const type = item[0]
          if (type === 0) {
            return typeof item[1] === 'number' ? `${item[1]}rpx` : ''
          } else if (type === 2) {
            if (typeof item[1] === 'string') {
              const relativePath = path.relative(
                this.pathInfo.resolve(path.dirname(cssPath)),
                this.pathInfo.resolve(item[1]),
              )
              return `@import "${relativePath}";`
            }
            return ''
          } else if (type === 1) {
            return opt.suffix || ''
          } else {
            return item[1]
          }
        }
        return item
      })
      saveLocalFile(this.pathInfo.outputResolve(cssPath), cssbeautify(arr.join('')))
    }
    return () => void 0
  }

  private async decompileAppWXSSWithRpx() {
    const globalSetMatchReg = /setCssToHead\(.+?}\)\(\)/g
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame || this.codeInfo.pageFrameHtml
    code = code.replaceAll('return rewritor;', 'return ()=> ({file, info});')
    code = code.replaceAll('__COMMON_STYLESHEETS__[', '__COMMON_STYLESHEETS_HOOK__[')
    // code = code.replaceAll('var setCssToHead', 'var __setCssToHead__')
    code = code.replaceAll(';__wxAppCode__', ';\n__wxAppCode__')
    const vm = createVM({
      sandbox: {__COMMON_STYLESHEETS_HOOK__: {}}
    })
    vm.run(code)
    /* 拦截直接执行 的 全局 css */
    let lastMatch = null
    do {
      lastMatch = globalSetMatchReg.exec(code)
      if (!lastMatch) break
      const cssSeedCode: string = lastMatch[0]
      try {
        const func = new Function('setCssToHead', cssSeedCode)
        func(this._setCssToHead.bind(this))
      } catch (e) {
        console.log(e.message)
      }
    } while (lastMatch)

    /* 拦截组件的 css */
    const __wxAppCode__ = vm.sandbox['__wxAppCode__']
    for (let cssPath in __wxAppCode__) {
      if (path.extname(cssPath) !== '.wxss') continue
      const {file: astList, info = {}} = __wxAppCode__[cssPath]()
      this._setCssToHead(astList, null, {path: cssPath, suffix: info.suffix})
    }
    /* 拦截 @import 引入的的公共 css */
    const __COMMON_STYLESHEETS_HOOK__ = vm.sandbox.__COMMON_STYLESHEETS_HOOK__ || {}
    for (const cssPath in __COMMON_STYLESHEETS_HOOK__) {
      const astList = __COMMON_STYLESHEETS_HOOK__[cssPath]
      this._setCssToHead(astList, null, {path: cssPath})
    }
  }

  /**
   * 反编译包中的 wxss 文件
   * */
  private async decompileAppWXSS() {
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame || this.codeInfo.pageFrameHtml
    if (!code.trim()) return
    const vm = createVM()
    vm.run(code)
    const __wxAppCode__ = vm.sandbox['__wxAppCode__']
    if (!__wxAppCode__) return
    const children = vm.sandbox.window.document.head.children || [] as HTMLStyleElement[]
    const mainPackageRenderedNodes = Array.from(children)
    // 先加载所有的 css，在节点中可能已经加载了部分主页的的 css， 下方作用是模拟切换页面并加载其页面的 css
    for (let filepath in __wxAppCode__) {
      if (path.extname(filepath) !== '.wxss') continue
      __wxAppCode__[filepath]()
      const lastStyleEl = children[children.length - 1]
      const attr_wxss_path = lastStyleEl.getAttribute('wxss:path')
      if (!attr_wxss_path) continue
      if (isPluginPath(filepath)) { // 解析插件，重定向到插件所在路径
        // 将插件路径重定向到主包 或者 分包所在路径
        filepath = filepath.replace(
          'plugin-private://',
          `${this.pathInfo.packRootPath}/${pluginDirRename[0]}/`
        )
        lastStyleEl.setAttribute('wxss:path', filepath)
      }
    }
    // 提取 css 及其所在路径
    Array.from(children).forEach((styleEl: Element) => {
      if (this.packType !== 'main') {
        if (mainPackageRenderedNodes.includes(styleEl)) return
      }
      const wxss_path = styleEl.getAttribute('wxss:path')
      if (['', 'null', 'undefined', undefined, null].includes(wxss_path)) return
      let cssText = styleEl.innerHTML
      cssText = cssText.replace(/body\s*\{/g, 'page{')  // 不太严谨， 后面使用 StyleSheet 进行处理
      saveLocalFile(this.pathInfo.outputResolve(wxss_path), cssbeautify(cssText))
      printLog(" Completed " + ` (${cssText.length}) \t` + colors.bold(colors.gray(wxss_path)))
    })
    if (children.length) {
      printLog(` \u25B6 反编译所有 wxss 文件成功. \n`, {isStart: true})
    }
  }

  public functionToWXS(wxsFunc: Function) {
    const funcHeader = 'nv_module={nv_exports:{}};';
    const funcEnd = 'return nv_module.nv_exports;}';
    const matchReturnReg = /return\s*\(\{(.|\r|\t|\n)*?}\)/
    const wxsCodeRequireReg = /require\(.+?\(\);/g

    let code = wxsFunc.toString()
    code = code.slice(code.indexOf(funcHeader) + funcHeader.length, code.lastIndexOf(funcEnd)).replaceAll('nv_', '')
    code = code.replace(wxsCodeRequireReg, (matchString: string) => {
      const newRequire = resetWxsRequirePath(matchString, './').replace('()', '')
      // console.log(newRequire)
      return newRequire
    })
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

  private async decompileAppWXS() {
    const DecompilationWXS = this.DecompilationWXS
    const shortDecompilationWXS = {}

    for (const wxsPath in DecompilationWXS) {   // 处理并保存 wxs 文件
      const wxsOutputShortPath = resetWxsRequirePath(wxsPath, './')
      shortDecompilationWXS[wxsOutputShortPath] = DecompilationWXS[wxsPath]
      if (path.extname(wxsPath) !== '.wxs') continue
      const wxsFunc = DecompilationWXS[wxsPath]
      const wxsString = this.functionToWXS(wxsFunc)
      // console.log(wxsOutputShortPath)
      saveLocalFile(this.pathInfo.outputResolve(wxsOutputShortPath), wxsString)
      printLog(" Completed " + ` (${wxsString.length}) \t` + colors.bold(colors.gray(wxsPath)))
    }
    
    for (const referencerOwnPath/* 引用 wxs 的 wxml文件 */ in this.wxsRefInfo) {
      const wxsInPageList = this.wxsRefInfo[referencerOwnPath]
      wxsInPageList.forEach(item => {
        let relativePath = path.relative(
          this.pathInfo.resolve(path.dirname(referencerOwnPath)), 
          this.pathInfo.resolve(item.fileSrc)
        )
        if (item.src.includes(":")) {
          item.templateList.push(`<wxs module="${item.moduleName}">\n${this.functionToWXS(shortDecompilationWXS[item.src])}\n</wxs>`);
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
        const wxmlCode = readLocalFile(wxmlAbsolutePath)
        saveLocalFile(wxmlAbsolutePath, `${wxmlCode}\n${templateString}`, {force: true})
      })
    }
    if (Object.keys(this.wxsRefInfo).length) {
      printLog(` \u25B6 反编译所有 wxs 文件成功. \n`, {isStart: true})
    }
  }

  private async decompileAppWXML() {
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame || this.codeInfo.pageFrameHtml
    if (!code) return
    let xPool = []
    const xPoolReg = /var\s+x=\s*\[(.+)];\$?/g
    const regRes = xPoolReg.exec(code)
    if (regRes && regRes[0].includes('var x=[') && regRes[0].includes('.wxml')) {
      xPool = [regRes[1]].toString().split(',').map(str => str.replaceAll("'", ''))
    }
    const vm = createVM()
    vm.run(code)
    getZ(code, (z: Record<string, any[]>) => {
      const {entrys, defines} = this.DecompilationModules
      const allEntrys = {...entrys}
      for (const appId in this.WXML_PLUGINS) {
        const pluginEntrys = this.WXML_PLUGINS[appId].entrys
        const newPluginEntrys = {}
        for (const name in pluginEntrys) {
          const pluginFilePath = path.join(
            this.packType === 'sub' ? this.pathInfo.packRootPath : './',
            `${pluginDirRename[0]}/${appId}`, name
          )
          // console.log(pluginFilePath)
          newPluginEntrys[pluginFilePath] = pluginEntrys[name]
        }
        Object.assign(allEntrys, newPluginEntrys)
      }

      for (let wxmlPath in allEntrys) {
        let result = tryDecompileWxml(allEntrys[wxmlPath].f.toString(), z, defines[wxmlPath], xPool)
        if (result) {
          const jsdom = new JSDOM(result)
          const document = jsdom.window.document
          const allImageEls = document.querySelectorAll('[src]')
          const matchAppidInfo = /__plugin__\/(\w+)\//.exec(wxmlPath)
          if (matchAppidInfo && wxmlPath.includes(pluginDirRename[0])) {
            const appid = matchAppidInfo[1]
            const pluginRoot = path.join(wxmlPath.split(appid)[0], appid)
            const srcList = Array.from(allImageEls).map(node => {
              let src = node.getAttribute('src')
              const originSrc = src
              if (src.includes('{{') && src.includes('}}')) return null
              if (!src.trim()) return null;
              if (src.startsWith('/')) {
                src = path.join(pluginRoot, src)
                src = path.relative(path.dirname(wxmlPath), src)
              }
              return [originSrc, src]
            }).filter(Boolean)
            srcList.forEach(([originSrc, src]) => {
              result = result.replaceAll(originSrc, src)
            })
          }
          const wxmlFullPath = this.pathInfo.outputResolve(wxmlPath)
          saveLocalFile(wxmlFullPath, result, {force: true})  // 不管文件存在或者存在默认模板， 此时通过 z 反编译出来的文件便是 wxml, 直接保存覆盖 
          printLog(` Completed  (${result.length}) \t${colors.bold(colors.gray(wxmlPath))}`)
        }
      }
    })
    await sleep(200)
    printLog(` \u25B6 反编译所有 wxml 文件成功. \n`, {isStart: true})
  }

  /**
   * 生成组件构成必要素的默认 json wxs, wxml, wxss 文件
   * */
  private async generateDefaultAppFiles() {
    const allPageAbsolutePathList = glob
      .globSync(
        `${this.pathInfo.resolve()}/**/*.html`
      )
      .filter((str) => {
        return ![
          'page-frame.html'
        ].includes(path.basename(str))
      })
      .map(_path => {
        return path.relative(this.pathInfo.outputPath, _path)
      })
    const allPage = allPageAbsolutePathList.map(str => str.replace(this.pathInfo.packRootPath, '.'))
    const allPageAndComp = allPage
      .concat(this.allRefComponentList)
      .concat(this.allSubPackagePages)

    for (let pagePath of allPageAndComp) {
      // /* json */
      // console.log(replaceExt(pagePath, ".json"), pagePath)
      let jsonPath = this.pathInfo.resolve(replaceExt(pagePath, ".json"))
      saveLocalFile(jsonPath, '{\n  "component":true\n}');
      let jsName = replaceExt(pagePath, ".js")
      let jsPath = this.pathInfo.resolve(jsName)
      saveLocalFile(jsPath, "Page({ data: {} })");
      /* wxml */
      let wxmlName = replaceExt(pagePath, ".wxml");
      let wxmlPath = this.pathInfo.resolve(wxmlName)
      saveLocalFile(wxmlPath, `<text>${wxmlName}</text>`);
      /* js */
      /* wxss */
      // let cssName = replaceExt(pagePath, ".wxss")
      // let cssPath = this.pathInfo.resolve(cssName)
      // saveLocalFile(cssPath, "/* " + cssName + " */");
    }
    printLog(` \u25B6 生成页面和组件构成必要的默认文件成功. \n`, {isStart: true})
  }

  public async decompileAll(options: { usePx?: boolean } = {}) {
    super.decompileAll()
    /* 开始编译 */
    await this.initApp()
    await this.decompileAllJSON()
    await this.decompileAppJSON() // 在 pageJson 解析后， 之后使用经过处理的 app.json 如果存在 app.json 则覆盖原来的 json
    await this.decompileAppJS()
    if (options.usePx) {
      await this.decompileAppWXSS()
    } else {
      await this.decompileAppWXSSWithRpx() // 优先 rpx 单位解析 
    }
    await this.decompileAppWXML()
    await this.decompileAppWXS()   // 解析 WXS 应该在解析完所有 WXML 之后运行 
    await this.decompileAppWorkers()
    /* ----------------------------------- */
    await this.generateDefaultAppFiles()
    await this.generaProjectConfigFiles()
    if (!isDev) {
      await this.removeCache()
    }
  }
}

