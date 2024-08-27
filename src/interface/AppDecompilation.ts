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
import {appJsonExcludeKeys, cssBodyToPageReg, pluginDirRename} from "@/constant";
import {getZ} from "@/utils/getZ";
import {tryDecompileWxml} from "@/utils/decompileWxml";
import {AppCodeInfo, ExecuteAllGwxFunction, ModuleDefine, UnPackInfo, WxmlRenderFunction, WxsRefInfo} from "@/type";
import {
  arrayDeduplication,
  getParameterNames,
  isPluginPath, isWxAppid, jsBeautify,
  printLog, removeElement, resetPluginPath, resetWxsRequirePath,
  sleep
} from "@/utils/common";
import {getAppPackCodeInfo} from "@/utils/getPackCodeInfo";
import {JSDOM} from "jsdom";

/**
 * 反编译小程序
 * */
export class AppDecompilation extends BaseDecompilation {
  private codeInfo: AppCodeInfo
  /**
   * 是否将第三方的远程插件转换变成本地离线使用
   * */
  public convertPlugin: boolean = false
  /**
   * 包的配置
   * */
  public appConfig: Record<any, any> = {}
  /**
   * 主包所有入口 ( 不包含分包 )
   * */
  public mainPackEntries: string[] = []

  /**
   * 所有在 page.json 中被引用的组件
   * */

  public constructor(packInfo: UnPackInfo) {
    super(packInfo);
  }

  /**
   * 初始化, 所有后续反编译且不会被动态改变的所需要的信息都在这里加载
   * */
  private async initApp() {
    this.codeInfo = getAppPackCodeInfo(this.pathInfo)
    this.appConfig = JSON.parse(readLocalFile(this.pathInfo.outputResolve(this.pathInfo.appJsonPath)) || '{}')

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
  }

  /**
   * 解析出 app.json 文件， 只有主包需要处理
   * */
  private async decompileAppJSON() {
    if (this.packType !== 'main') return
    await sleep(200)
    const appConfig: Record<string, any> = JSON.parse(this.codeInfo.appConfigJson)
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

    if (this.codeInfo.appConfigJson.includes('"renderer": "skyline"') || this.codeInfo.appConfigJson.includes('"renderer":"skyline"')) {
      appConfig.lazyCodeLoading = "requiredComponents"
      delete appConfig.window['navigationStyle']
      delete appConfig.window['navigationBarTextStyle']
      delete appConfig.window['navigationBarTitleText']
      delete appConfig.window['navigationBarBackgroundColor']
    }

    this.mainPackEntries = arrayDeduplication([...appConfig.pages])
    if (appConfig.subPackages) {
      let subPackages = [];
      appConfig.subPackages.forEach((subPackage: Record<string, any>) => {
        let root = subPackage.root;
        let newPages = [];
        root = !String(root).endsWith('/') ? root + '/' : root
        root = String(root).startsWith('/') ? root.substring(1) : root
        subPackage.root = root;
        if (Array.isArray(appConfig.pages)) {
          for (let pageString of appConfig.pages) {
            if (pageString.startsWith(root)) {
              // console.log(pageString)
              removeElement(this.mainPackEntries, pageString)
              newPages.push(pageString.replace(root, ''));
            }
          }
          subPackage.pages = arrayDeduplication(newPages);
        }
        if (subPackage.plugins) {
          subPackage.plugins = {} // 分包插件从远程替换成本地编译使用
        }
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
      appConfig.pages =/*必须在subPackages 之后*/ this.mainPackEntries
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
      const pageJson: Record<any, any> = __wxAppCode__[filePath]
      let realJsonConfigString = JSON.stringify(pageJson, null, 2)
      let jsonOutputPath = filePath
      if (isPluginPath(filePath)) {
        tempFilePath = path.join(pluginDirRename[0], filePath.replace('plugin-private://', ''))
        jsonOutputPath = path.join(this.pathInfo.packRootPath, tempFilePath)
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
        cssPath = resetPluginPath(cssPath, path.join(this.pathInfo.packRootPath, pluginDirRename[0]))
      }
      arr = arr.map((item) => {
        if (Array.isArray(item)) {
          const type = item[0]
          if (type === 0) {
            return typeof item[1] === 'number' ? `${item[1]}rpx` : ''
          } else if (type === 2) {
            if (typeof item[1] === 'string') {
              const relativePath = path.relative(
                this.pathInfo.outputResolve(path.dirname(cssPath)),
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
      let cssText = arr.join('')
      cssText = cssText.replace(cssBodyToPageReg, 'page{')
      saveLocalFile(this.pathInfo.outputResolve(cssPath), cssbeautify(cssText))
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
    // code = code.replaceAll(
    //   'var setCssToHead=function(file,_xcInvalid,info){', 
    //   'var setCssToHead=function(file,_xcInvalid,info){ return {file, info} ', 
    // )
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
    for (let cssPath in __COMMON_STYLESHEETS_HOOK__) {
      const astList = __COMMON_STYLESHEETS_HOOK__[cssPath]
      cssPath = path.join(this.pathInfo.packRootPath, cssPath)
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
        filepath = resetPluginPath(filepath, path.join(this.pathInfo.packRootPath, pluginDirRename[0]))
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
      cssText = cssText.replace(cssBodyToPageReg, 'page{')  // 不太严谨， 后面使用 StyleSheet 进行处理
      saveLocalFile(this.pathInfo.outputResolve(wxss_path), cssbeautify(cssText))
      printLog(" Completed " + ` (${cssText.length}) \t` + colors.bold(colors.gray(wxss_path)))
    })
    if (children.length) {
      printLog(` \u25B6 反编译所有 wxss 文件成功. \n`, {isStart: true})
    }
  }

  public functionToWXS(wxsFunc: Function, basePath: string) {
    if (!basePath) {
      throw new Error('basePath is required')
    }
    const funcHeader = 'nv_module={nv_exports:{}};';
    const funcEnd = 'return nv_module.nv_exports;}';
    const matchReturnReg = /return\s*\(\{(.|\r|\t|\n)*?}\)/
    const wxsCodeRequireReg = /require\(.+?\(\);/g

    let code = wxsFunc.toString()
    code = code.slice(code.indexOf(funcHeader) + funcHeader.length, code.lastIndexOf(funcEnd)).replaceAll('nv_', '')
    code = code.replace(wxsCodeRequireReg, (matchString: string) => {
      const newRequireString = resetWxsRequirePath(matchString, './')
        .replace("require('", '')
        .replace("')();", '')
      let relativePath = path.relative(
        this.pathInfo.resolve(path.dirname(basePath)),
        this.pathInfo.resolve(newRequireString),
      );
      return `require('${relativePath}');`
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

  /**
   * 执行所有的 $gwx_ 函数， 包含 主环境 和 插件函数
   * */
  private executeAllGwxFunction(code: string): ExecuteAllGwxFunction {
    code = code
      .replaceAll(
        'var e_={}',
        `var e_ = {}; window.COMPONENTS = global;`
      )
      .replaceAll(
        'function(){if(!nnm[n])',
        `function(){ return {n, func: nnm[n]};`
      )
    const vm = createVM({
      sandbox: {
        setTimeout
      }
    })
    vm.run(code)

    // 主包 或 分包 自身插件的 模块 定义信息
    const PLUGINS: Record<string, ModuleDefine> = {}
    // 主环境( 主包， 分包 )的 模块 定义信息
    const COMPONENTS: ModuleDefine = {
      entrys: {},
      modules: {},
      defines: {}
    }
    const ALL_ENTRYS: ModuleDefine["entrys"] = {}
    const ALL_MODULES: ModuleDefine["modules"] = {}
    const ALL_DEFINES: ModuleDefine["defines"] = {}
    const pluginNames = glob.globSync(`${this.pathInfo.resolve(pluginDirRename[1])}/*`)
      .map(pluginPath => path.basename(pluginPath))
      .filter(isWxAppid)

    for (const name in vm.sandbox) {
      const func = vm.sandbox[name]
      if (typeof func !== 'function') continue
      vm.sandbox.__wxAppCode__ = {}
      const isPlugin = name.startsWith('$gwx_wx') && pluginNames.find(pluginName => name.includes(pluginName))
      const global: Partial<ModuleDefine> = {}
      if (isPlugin) { // 插件处理
        const appId = name.replace('$gwx_', '') // 插件APPID
        try {
          // 将所有的 $gwx_  加载到 global 对象中， window.COMPONENTS 是 global 的引用 
          func(void 0, global)
          PLUGINS[appId] = global as any // 区分每个插件环境
        } catch (e) {
        }
      } else if (name.startsWith('$gwx')) { // 主环境模块组件处理
        try {
          func('', COMPONENTS)() // 注入主环境
        } catch (e) {
        }
      }
    }
    //--------------------------------------------------------------------------
    const getWxsInfo = (data: Record<any, any>, appid?: string): Record<any, any> => {
      if (typeof data !== 'function') return data
      data = data()
      data.isInline = data.n.startsWith('m_')
      const wxsPath = `${resetWxsRequirePath(data.n).split(':')[0]}`
      if (appid) {
        data.appid = appid
        data.n = path.join(this.pathInfo.packRootPath, pluginDirRename[0], appid, wxsPath)
      } else {
        data.n = path.join(this.pathInfo.packRootPath, wxsPath)
      }
      return data
    }
    //--------------------------------------------------------------------------
    const wxsModuleProcess = (receive: Record<any, any>, _path: string, data: any, appid?: string) => {
      const ext = path.extname(_path)
      if (ext === '.wxs' && typeof data === 'function') {
        data = getWxsInfo(data, appid)
      }
      if (ext === '.wxml' && typeof data === 'object') {
        for (const moduleName in data) {
          data[moduleName] = getWxsInfo(data[moduleName], appid)
        }
      }
      receive[_path] = data
    }
    //--------------------------------------------------------------------------
    const merge = (receive: Record<any, any>, type: keyof ModuleDefine) => {
      for (let _path in COMPONENTS[type]) {
        let data: any = COMPONENTS[type][_path]
        if (type === 'modules') {
          wxsModuleProcess(receive, _path, data)
        } else {
          receive[path.join(_path)] = COMPONENTS[type][_path]
        }
      }
      for (const appid in PLUGINS) {
        const plugin = PLUGINS[appid]
        for (let _path in plugin[type]) {
          let data: any = plugin[type][_path]
          _path = path.join(this.pathInfo.packRootPath, pluginDirRename[0], appid, _path)
          if (type === 'modules') {
            wxsModuleProcess(receive, _path, data, appid)
          } else {
            receive[path.join(_path)] = data
          }
        }
      }
    }
    //--------------------------------------------------------------------------
    // 合并主环境 和 插件环境
    merge(ALL_ENTRYS, 'entrys')
    merge(ALL_MODULES, 'modules')
    merge(ALL_DEFINES, 'defines')

    return {
      COMPONENTS,
      PLUGINS,
      ALL_ENTRYS,
      ALL_MODULES,
      ALL_DEFINES
    }
  }

  private async decompileAppWXS() {
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame || this.codeInfo.pageFrameHtml
    const {ALL_MODULES, PLUGINS} = this.executeAllGwxFunction(code)
    const wxsRefInfo = []
    for (const wxmlPath in ALL_MODULES) {
      if (path.extname(wxmlPath) !== '.wxml') continue
      const wxmlRefWxsInfo = ALL_MODULES[wxmlPath]
      for (const moduleName in wxmlRefWxsInfo) {
        const {n, func, isInline} = wxmlRefWxsInfo[moduleName]
        // console.log(n, 1, wxmlPath, func, isInline, moduleName)
        if (n && func) {
          wxsRefInfo.push(<any>{
            wxmlPath: wxmlPath,
            wxsPath: n,
            isInline: isInline,
            moduleName,
            wxsRender: func,
            templateList: []
          })
        }
      }
    }
    // 保存被 wxml 引用的 wxs 文件
    wxsRefInfo.forEach(item => {
      if (item.isInline) return
      if (!item.wxsPath.endsWith('.wxs')) return
      const wxsString = this.functionToWXS(item.wxsRender, item.wxsPath)
      saveLocalFile(this.pathInfo.outputResolve(item.wxsPath), wxsString)
      printLog(" Completed " + ` (${wxsString.length}) \t` + colors.bold(colors.gray(item.wxsPath)))
    })
    // 保存游离的被 JS 引用的 wxs 文件
    for (const wxsPath in ALL_MODULES) {
      if (!wxsPath.endsWith('.wxs')) continue
      const result: Record<any, any> = ALL_MODULES[wxsPath]
      const wxsString = this.functionToWXS(result.func, wxsPath)
      saveLocalFile(this.pathInfo.outputResolve(wxsPath), wxsString)
      printLog(" Completed " + ` (${wxsString.length}) \t` + colors.bold(colors.gray(wxsPath)))
    }
    // 解析模板归属
    wxsRefInfo.forEach(item => {
      let relativePath = path.relative(
        this.pathInfo.resolve(path.dirname(item.wxmlPath)),
        this.pathInfo.resolve(item.wxsPath)
      )
      if (item.isInline) {
        item.templateList.push(`<wxs module="${item.moduleName}">\n${this.functionToWXS(item.wxsRender, item.wxsPath)}\n</wxs>`);
      } else {
        item.templateList.push(`<wxs module="${item.moduleName}" src="${relativePath}"/>`);
      }
    })
    // 修改 wxml 文件
    wxsRefInfo.forEach(item => {
      if (item.templateList && !item.templateList.length) return
      const wxmlAbsolutePath = this.pathInfo.outputResolve(item.wxmlPath)
      const templateString = item.templateList.join('\n')
      const wxmlCode = readLocalFile(wxmlAbsolutePath)
      saveLocalFile(wxmlAbsolutePath, `${wxmlCode}\n${templateString}`, {force: true})
    })

    if (Object.keys(wxsRefInfo).length) {
      printLog(` \u25B6 反编译所有 wxs 文件成功. \n`, {isStart: true})
    }
  }

  /**
   * 获取定义的 X 路径池， 池中的内容顺序不能变
   * */
  private _getXPool(code: string) {
    let xPool = []
    const xPoolReg = /var\s+x=\s*\[(.+)];\$?/g
    const regResList = (code.match(xPoolReg) || [])
      .sort((a, b) => b.length - a.length) // 排序， 优先匹配内容最多的， 可能会遇到特殊情况，后面再看看
    if (regResList.length && regResList[0].includes('var x=[') && regResList[0].includes('.wxml')) {
      xPool = regResList[0]
        .replaceAll('var x=[', '')
        .replaceAll('];', '')
        .split(',')
        .map(str => str.replaceAll("'", ''))
    }
    return xPool
  }

  private async decompileAppWXML() {
    let code = this.codeInfo.appWxss || this.codeInfo.pageFrame || this.codeInfo.pageFrameHtml
    if (!code) return
    const {ALL_DEFINES, ALL_ENTRYS} = this.executeAllGwxFunction(code)
    let xPool = this._getXPool(code)
    const vm = createVM()
    vm.run(code)
    getZ(code, (z: Record<string, any[]>) => {
      const entrys = ALL_ENTRYS
      for (let wxmlPath in entrys) {
        let result = tryDecompileWxml(entrys[wxmlPath].f.toString(), z, ALL_DEFINES[wxmlPath], xPool)
        if (result) {
          /* 重定向图片相对链接 */
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
  }
}

