import colors from "picocolors";
import path from "node:path";
import {glob} from "glob";
import fs from "node:fs";
import {PloyFill} from "./PloyFill";
import {removeList} from "@/constant";
import {createVM} from "@/utils/createVM";
import {deleteLocalFile, readLocalFile, saveLocalFile} from "@/utils/fs-process";
import {
  AppTypeMapping,
  CodeInfo,
  MiniAppType,
  MiniPackType,
  PackTypeMapping,
  PathResolveInfo,
  UnPackInfo
} from "@/type";
import {commonDir, printLog, sleep} from "@/utils/common";

export class DecompilationBase {
  public pathInfo: PathResolveInfo
  public outputPathInfo: PathResolveInfo
  public packPath: string
  public packType: MiniPackType
  public codeInfo: CodeInfo
  public rootCodeInfo: CodeInfo
  public appType: MiniAppType
  public ployFill: PloyFill

  constructor(packInfo: UnPackInfo) {
    this.pathInfo = packInfo.pathInfo
    this.outputPathInfo = packInfo.outputPathInfo
    this.packPath = packInfo.inputPath
    this.packType = packInfo.packType
    this.appType = packInfo.appType
    this.codeInfo = {} as CodeInfo
    this.ployFill = new PloyFill(this.packPath)
  }

  /**
   * 反编译 Worker 文件
   * */
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
   * 生成小程序的项目配置
   * */
  protected async generaProjectConfigFiles() {
    const projectPrivateConfigPath = this.pathInfo.outputResolve('project.private.config.json')
    const projectPrivateConfigData = {
      "setting": {
        "es6": false,
        "urlCheck": false,
        "ignoreDevUnusedFiles": false,
        "ignoreUploadUnusedFiles": false,
      }
    }
    saveLocalFile(projectPrivateConfigPath, JSON.stringify(projectPrivateConfigData, null, 2))
  }

  protected async removeCache() {
    await sleep(500)
    let cont = 0
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
      if (removeList.includes(fileName)) {
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
}
