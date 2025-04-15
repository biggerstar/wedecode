import fs from "node:fs";
import { getPathResolveInfo, isPluginPath, printLog, replaceExt, sleep } from "@/utils/common";
import colors from "picocolors";
import { glob } from "glob";
import { AppMainPackageNames, isDev } from "@/bin/wedecode/enum";
import { deepmerge } from "@biggerstar/deepmerge";
import { deleteLocalFile, readLocalFile, readLocalJsonFile, saveLocalFile } from "@/utils/fs-process";
import { removeAppFileList, removeGameFileList } from "@/constant";
import path from "node:path";
import { GameDecompilation } from "@/interface/game-decompilation";
import { AppDecompilation } from "@/interface/app-decompilation";
import { DecompilationControllerState, PackTypeMapping, PathResolveInfo } from "@/type";
import { UnpackWxapkg } from "@/interface/unpack-wxapkg";


export class DecompilationController {
  public readonly inputPath: string
  public readonly outputPath: string
  public config: DecompilationControllerState
  public readonly pathInfo: PathResolveInfo

  constructor(inputPath: string, outputPath: string) {
    if (!inputPath) {
      throw new Error('inputPath 是必须的')
    }
    if (!outputPath) {
      throw new Error('outputPath 是必须的')
    }
    this.inputPath = path.resolve(inputPath)
    this.outputPath = path.resolve(outputPath)
    this.pathInfo = getPathResolveInfo(this.outputPath)
    this.config = {
      usePx: false,
      unpackOnly: false
    }
  }

  public setState(opt: Partial<DecompilationControllerState>) {
    Object.assign(this.config, opt)
  }

  /**
   * 单包反编译
   * */
  private async singlePackMode(wxapkgPath: string, outputPath: string): Promise<void> {
    const packInfo = await UnpackWxapkg.unpackWxapkg(wxapkgPath, outputPath)
    if (this.config.unpackOnly) return
    if (packInfo.appType === 'game') {
      // 小游戏
      const decompilationGame = new GameDecompilation(packInfo)
      await decompilationGame.decompileAll()
    } else {
      // 小程序
      const decompilationApp = new AppDecompilation(packInfo)
      decompilationApp.convertPlugin = true
      await decompilationApp.decompileAll({
        usePx: this.config.usePx,
      })
    }
    printLog(`\n ✅  ${colors.bold(colors.green(PackTypeMapping[packInfo.packType] + '反编译结束!'))}`, { isEnd: true })

  }

  /**
   * 启动反编译流程
   * ]*/
  public async startDecompilerProcess(): Promise<void> {
    const isDirectory = fs.statSync(this.inputPath).isDirectory()
    printLog(`\n \u25B6 当前操作类型: ${colors.yellow(isDirectory ? '分包模式' : '单包模式')}`, { isEnd: true })
    // await this.startJob()
    if (isDirectory) {
      const wxapkgPathList = glob.globSync(`${this.inputPath}/*.wxapkg`)
      wxapkgPathList.sort((_pathA, _b) => {
        const foundMainPackage = AppMainPackageNames.find(fileName => _pathA.endsWith(fileName))
        if (foundMainPackage) return -1; // 将 'APP.wxapkg' 排到前面, 保证第一个解析的是主包
        return 0;
      });
      for (const packPath of wxapkgPathList) {   // 目录( 多包 )
        await this.singlePackMode(packPath, this.outputPath)
      }
    } else {  // 文件 ( 单包 )
      await this.singlePackMode(this.inputPath, this.outputPath)
    }
    await this.endingAllJob()
  }

  /**
   * 生成小程序的项目配置
   * */
  protected async generaProjectConfigFiles() {
    const projectPrivateConfigJsonPath = path.join(this.outputPath, 'project.private.config.json')
    const DEV_defaultConfigData = {
      "setting": {
        "ignoreDevUnusedFiles": false,
        "ignoreUploadUnusedFiles": false,
      }
    }
    const defaultConfigData = {
      "setting": {
        "es6": false,
        "urlCheck": false,
      }
    }
    if (isDev) {
      Object.assign(defaultConfigData.setting, DEV_defaultConfigData.setting)
    }
    let finallyConfig = {}
    const projectPrivateConfigString = readLocalFile(projectPrivateConfigJsonPath)
    if (projectPrivateConfigString) {
      const projectPrivateConfigData = JSON.parse(projectPrivateConfigString)
      deepmerge(projectPrivateConfigData, defaultConfigData)
      finallyConfig = projectPrivateConfigData
    } else {
      finallyConfig = defaultConfigData
    }
    saveLocalFile(projectPrivateConfigJsonPath, JSON.stringify(finallyConfig, null, 2), { force: true })
  }

  private async _analyticalCompDependence(analysisList: string[], deps = []): Promise<string[]> {
    const readFilePromises = analysisList
      .map((pageDir: string) => {
        return new Promise(async (resolve) => {
          const jsonPath = path.resolve(this.outputPath, path.dirname(pageDir), `${path.basename(pageDir)}.json`)
          let code = ''
          try {
            code = await fs.promises.readFile(jsonPath, 'utf-8')
          } catch (e) {
            // no such file or directory
          }

          resolve({
            pageDir,
            jsonPath,
            code
          })
        })
      })
    const allJsonCodeList = await Promise.all<Record<any, any>>(readFilePromises)

    const currentCompDep = []
    for (const info of allJsonCodeList) {
      deps.push(info.pageDir)
      try {
        const pageJson = JSON.parse(info.code)
        const usingComponents = pageJson.usingComponents
        if (usingComponents) {
          const depCompList: string[] = Object.values(usingComponents)
          for (const compUrl of depCompList) {
            let depPath = ''
            if (compUrl.startsWith('/')) {
              depPath = path.resolve(this.outputPath, compUrl.substring(1))
            } else {
              depPath = path.resolve(path.dirname(info.jsonPath), compUrl)
            }
            depPath = path.relative(this.outputPath, depPath)
            if (!deps.includes(depPath)) {
              // console.log('--------------------------------------------------')
              // console.log(compUrl)
              // console.log(info.pageDir)
              // console.log('dep', depPath)
              currentCompDep.push(depPath)
              deps.push(depPath)
            }
          }
        }
      } catch (e) { }

      // 递归处理依赖
    }
    // console.log("🚀 ~ DecompilationController ~ _analyticalCompDependence ~ currentCompDep:", currentCompDep)
    if (currentCompDep.length) {
      await this._analyticalCompDependence(currentCompDep, deps)
    }
    return deps.flat(Infinity).filter(Boolean)
  }

  /**
   * 生成组件构成必要素的默认 json wxs, wxml, wxss 文件
   * */
  private async generateDefaultAppFiles() {
    const appConfigJson = readLocalJsonFile(path.join(this.outputPath, 'app-config.json'))
    const appConfigPages = (appConfigJson?.pages || [])
      .map(cPath => cPath.endsWith('/') ? cPath.substring(0, cPath.length - 1) : cPath)
    // const allPageGlobPathList = glob
    //   .globSync(`${this.outputPath}/**/*{.html,.wxml}`)
    //   .filter((str) => {
    //     return ![
    //       'page-frame.html'
    //     ].includes(path.basename(str))
    //   })

    const allPage = await this._analyticalCompDependence(appConfigPages)

    const allPageAndComp = allPage.filter(_path => !isPluginPath(_path))

    for (let pagePath of allPageAndComp) {
      // console.log("🚀 ~ DecompilationController ~ generateDefaultAppFiles ~ pagePath:", pagePath)
      // /* json */
      // console.log(replaceExt(pagePath, ".json"), pagePath)
      let jsonPath = path.join(this.outputPath, replaceExt(pagePath, ".json"))
      saveLocalFile(jsonPath, '{\n  "component":true\n}');
      let jsName = replaceExt(pagePath, ".js")
      let jsPath = path.join(this.outputPath, jsName)
      saveLocalFile(jsPath, "Page({ data: {} })");
      /* wxml */
      let wxmlName = replaceExt(pagePath, ".wxml");
      let wxmlPath = path.join(this.outputPath, wxmlName)
      saveLocalFile(wxmlPath, `<text>${wxmlName}</text>`);
    }
    printLog(` \u25B6 生成页面和组件构成必要的默认文件成功. \n`, { isStart: true })
  }

  /**
   * 缓存移除
   * */
  protected async removeCache() {
    await sleep(500)
    let cont = 0
    const removeFileList = removeGameFileList.concat(removeAppFileList)
    const allFile = glob.globSync(`${this.outputPath}/**/**{.js,.html,.json}`)
    allFile.forEach(filepath => {
      const fileName = path.basename(filepath).trim()
      const extname = path.extname(filepath)
      if (!fs.existsSync(filepath)) return
      let _deleteLocalFile = () => {
        cont++
        deleteLocalFile(filepath, { catch: true, force: true })
      }
      if (removeFileList.includes(fileName)) {
        _deleteLocalFile()
      } else if (extname === '.html') {
        const feature = 'var __setCssStartTime__ = Date.now()'
        const data = readLocalFile(filepath)
        if (data.includes(feature)) _deleteLocalFile()
      } else if (filepath.endsWith('.appservice.js')) {
        _deleteLocalFile()
      } else if (filepath.endsWith('.webview.js')) {
        _deleteLocalFile()
      }
    })

    if (cont) {
      printLog(`\n \u25B6 移除中间缓存产物成功, 总计 ${colors.yellow(cont)} 个`, { isStart: true })
    }
  }

  /**
   * 收尾工作
   * */
  private async endingAllJob(): Promise<void> {
    if (this.config.unpackOnly) return
    await this.generateDefaultAppFiles()
    await this.generaProjectConfigFiles()
    if (!isDev) {
      await this.removeCache()
    }
    printLog(` ✅  ${colors.bold(colors.green('编译流程结束!'))}`, { isEnd: true })
  }
}
