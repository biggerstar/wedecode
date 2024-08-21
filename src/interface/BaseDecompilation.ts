import colors from "picocolors";
import path from "node:path";
import {glob} from "glob";
import fs from "node:fs";
import {PloyFill} from "./PloyFill";
import {removeAppFileList, removeGameFileList} from "@/constant";
import {createVM} from "@/utils/createVM";
import {deleteLocalFile, readLocalFile, saveLocalFile} from "@/utils/fs-process";
import {
  AppTypeMapping,
  MiniAppType,
  MiniPackType,
  PackTypeMapping,
  PathResolveInfo,
  UnPackInfo
} from "@/type";
import {commonDir, jsBeautify, printLog, removeVM2ExceptionLine, sleep} from "@/utils/common";
import {deepmerge} from "@biggerstar/deepmerge";

export class BaseDecompilation {
  public readonly pathInfo: PathResolveInfo
  public readonly outputPathInfo: PathResolveInfo
  public readonly packPath: string
  public readonly packType: MiniPackType
  public readonly appType: MiniAppType
  public readonly ployFill: PloyFill

  constructor(packInfo: UnPackInfo) {
    this.pathInfo = packInfo.pathInfo
    this.outputPathInfo = packInfo.outputPathInfo
    this.packPath = packInfo.inputPath
    this.packType = packInfo.packType
    this.appType = packInfo.appType
    this.ployFill = new PloyFill(this.packPath)
  }

  protected async decompileAppWorker(): Promise<any> {
    await sleep(200)
    if (!fs.existsSync(this.pathInfo.workersPath)) {
      return
    }
    if (!fs.existsSync(this.pathInfo.appJsonPath)) {
      return
    }
    const appConfig: Record<any, any> = JSON.parse(readLocalFile(this.pathInfo.appJsonPath))
    let code = readLocalFile(this.pathInfo.workersPath)
    let commPath: string = '';
    let vm = createVM({
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
    saveLocalFile(this.pathInfo.appJsonPath, JSON.stringify(appConfig, null, 2))
    printLog(` \u25B6 反编译 Worker 文件成功. \n`, {isStart: true})
  }

  /**
   * 反编译 Worker 文件
   * */
  protected async decompileAppWorkers(): Promise<any> {
    await sleep(200)
    if (!fs.existsSync(this.pathInfo.workersPath)) {
      return
    }
    let allWorkerList = []
    const _this = this
    let commPath: string = '';
    let code = readLocalFile(this.pathInfo.workersPath)
    let vm = createVM({
      sandbox: {
        define(name: string, func: Function) {
          allWorkerList.push(name)
          _this._parseJsDefine(name, func)
          const workerPath = path.dirname(name) + '/';
          if (!commPath) commPath = workerPath;
          commPath = commonDir(commPath, workerPath);
        }
      }
    })
    vm.run(code);
    printLog(`Worker path:  ${commPath}`);

    if (commPath) {
      const configFileName = this.appType === 'game' ? this.pathInfo.gameJsonPath : this.pathInfo.appJsonPath
      const appConfig: Record<any, any> = JSON.parse(readLocalFile(configFileName))
      appConfig.workers = commPath
      saveLocalFile(configFileName, JSON.stringify(appConfig, null, 2), {force: true})
    }
    printLog(` \u25B6 反编译 Worker 文件成功. \n`, {isStart: true})
  }

  /**
   * 生成小程序的项目配置
   * */
  protected async generaProjectConfigFiles() {
    const defaultConfigData = {
      "setting": {
        "es6": false,
        "urlCheck": false,
        "ignoreDevUnusedFiles": false,
        "ignoreUploadUnusedFiles": false,
      }
    }
    let finallyConfig = {}
    const projectPrivateConfigString = readLocalFile(this.pathInfo.projectPrivateConfigJsonPath)
    if (projectPrivateConfigString) {
      const projectPrivateConfigData = JSON.parse(projectPrivateConfigString)
      deepmerge(projectPrivateConfigData, defaultConfigData)
      finallyConfig = projectPrivateConfigData
    } else {
      finallyConfig = defaultConfigData
    }
    saveLocalFile(this.pathInfo.projectPrivateConfigJsonPath, JSON.stringify(finallyConfig, null, 2), {force: true})
  }

  protected async removeCache() {
    await sleep(500)
    let cont = 0
    const removeFileList = this.appType === 'game' ? removeGameFileList : removeAppFileList
    const absolutePackRootPath = this.pathInfo.outputResolve(this.pathInfo.packRootPath)
    const allFile = glob.globSync(`${absolutePackRootPath}/**/**{.js,.html,.json}`)
    allFile.forEach(filepath => {
      const fileName = path.basename(filepath).trim()
      const extname = path.extname(filepath)
      if (!fs.existsSync(filepath)) return
      let _deleteLocalFile = () => {
        cont++
        deleteLocalFile(filepath, {catch: true, force: true})
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
      printLog(`\n \u25B6 移除中间缓存产物成功, 总计 ${colors.yellow(cont)} 个`, {isStart: true})
    }
  }

  protected decompileAll() {
    printLog(` \u25B6 当前反编译目标[ ${AppTypeMapping[this.appType]} ] (${colors.yellow(PackTypeMapping[this.packType])}) : ` + colors.blue(this.packPath));
    printLog(` \u25B6 当前输出目录:  ${colors.blue(this.pathInfo.outputPath)}\n`, {
      isEnd: true,
    });
  }

  protected _parseJsDefine(name: string, func: Function) {
    if (path.extname(name) !== '.js') return
    // console.log(name, func);
    /* 看看是否有 polyfill,  有的话直接使用注入 polyfill */
    const foundPloyfill = this.ployFill.findPloyfill(name)
    let resultCode: string = ''
    if (foundPloyfill) {
      resultCode = readLocalFile(foundPloyfill.fullPath)
    } else {
      let code = func.toString();
      code = code.slice(code.indexOf("{") + 1, code.lastIndexOf("}") - 1).trim();
      if (code.startsWith('"use strict";')) {
        code = code.replaceAll('"use strict";', '')
      } else if (code.startsWith("'use strict';")) {
        code = code.replaceAll(`'use strict';`, '')
      } else if ((code.startsWith('(function(){"use strict";') || code.startsWith("(function(){'use strict';")) && code.endsWith("})();")) {
        code = code.slice(25, -5);
      }
      code = code.replaceAll('require("@babel', 'require("./@babel')
      resultCode = jsBeautify(code.trim());
    }
    if (resultCode.trim()) {
      saveLocalFile(
        this.pathInfo.outputResolve(name),
        removeVM2ExceptionLine(resultCode),
        {force: true}
      )
      printLog(" Completed " + ` (${resultCode.length}) \t` + colors.bold(colors.gray(name)))
    }
  }

}
