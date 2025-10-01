import colors from "picocolors";
import path from "node:path";
import fs from "node:fs";
import {PloyFillCover} from "@/interface/ployfill-cover";
import {createVM, runVmCode} from "@/utils/create-vm";
import {readLocalFile, saveLocalFile} from "@/utils/fs-process";
import {
  AppTypeMapping,
  MiniAppType,
  MiniPackType,
  PackTypeMapping,
  PathResolveInfo,
  UnPackInfo
} from "@/typings/index";
import {commonDir, jsBeautify, printLog, removeVM2ExceptionLine, sleep} from "@/utils/common";

export class BaseDecompilation {
  public readonly pathInfo: PathResolveInfo
  public readonly outputPathInfo: PathResolveInfo
  public readonly packPath: string
  public readonly packType: MiniPackType
  public readonly appType: MiniAppType
  public readonly ployFill: PloyFillCover

  constructor(packInfo: UnPackInfo) {
    this.pathInfo = packInfo.pathInfo
    this.outputPathInfo = packInfo.outputPathInfo
    this.packPath = packInfo.inputPath
    this.packType = packInfo.packType
    this.appType = packInfo.appType
    this.ployFill = new PloyFillCover(this.packPath)
  }

  protected async decompileAppWorker(): Promise<any> {
    await sleep(200)
    if (!fs.existsSync(this.pathInfo.workersPath)) {
      return
    }
    const appConfigString = readLocalFile(this.pathInfo.appJsonPath)
    if (!appConfigString) return
    const appConfig: Record<any, any> = JSON.parse(appConfigString)
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
    runVmCode(vm, code.slice(code.indexOf("define(")))
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
    const _this = this
    let commPath: string = '';
    let code = readLocalFile(this.pathInfo.workersPath)
    let vm = createVM({
      sandbox: {
        define(name: string, func: Function) {
          _this._parseJsDefine(name, func)
          const workerPath = path.dirname(name) + '/';
          if (!commPath) commPath = workerPath;
          commPath = commonDir(commPath, workerPath);
        }
      }
    })
    runVmCode(vm, code)
    printLog(`Worker path:  ${commPath}`);

    if (commPath) {
      const configFileName = this.appType === 'game' ? this.pathInfo.gameJsonPath : this.pathInfo.appJsonPath
      const appConfig: Record<any, any> = JSON.parse(readLocalFile(configFileName))
      appConfig.workers = commPath
      saveLocalFile(configFileName, JSON.stringify(appConfig, null, 2), {force: true})
    }
    printLog(` \u25B6 反编译 Worker 文件成功. \n`, {isStart: true})
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
    saveLocalFile(
      this.pathInfo.outputResolve(name),
      removeVM2ExceptionLine(resultCode.trim()),
      {force: true}
    )
    printLog(" Completed " + ` (${resultCode.length}) \t` + colors.bold(colors.gray(name)))
  }

}
