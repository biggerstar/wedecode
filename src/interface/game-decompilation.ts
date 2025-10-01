import colors from "picocolors";
import {saveLocalFile} from "@/utils/fs-process";
import {createVM, runVmCode} from "@/utils/create-vm";
import {printLog, sleep} from "@/utils/common";
import {GameCodeInfo, UnPackInfo} from "@/typings";
import {BaseDecompilation} from "@/interface/base-decompilation";
import {getGamePackCodeInfo} from "@/utils/get-pack-codeInfo";
import {GameJsonExcludeKeys} from "@/constant";

/**
 * 反编译工具类入口
 * */
export class GameDecompilation extends BaseDecompilation {
  private codeInfo: GameCodeInfo
  public wxsList: any[]
  public readonly allRefComponentList: string[] = []
  public readonly allSubPackagePages: string[] = []
  public readonly allPloyFill: { fullPath: string, ployfillPath: string }[] = []

  public constructor(packInfo: UnPackInfo) {
    super(packInfo);
  }

  /**
   * 初始化小游戏所需环境和变量
   * */
  private async initGame() {
    this.codeInfo = getGamePackCodeInfo(this.pathInfo)
    const loadInfo = {}
    for (const name in this.codeInfo) {
      loadInfo[name] = this.codeInfo[name].length
    }
    console.log(loadInfo)
  }

  /**
   * 反编译 game.json 文件， 只有主包需要处理
   * */
  private async decompileGameJSON() {
    if (this.packType !== 'main') return
    await sleep(200)
    const gameConfigString = this.codeInfo.appConfigJson
    const gameConfig: Record<any, any> = JSON.parse(gameConfigString)
    Object.assign(gameConfig, gameConfig.global)
    GameJsonExcludeKeys.forEach(key => delete gameConfig[key])

    const outputFileName = 'game.json'
    const gameConfigSaveString = JSON.stringify(gameConfig, null, 2)
    saveLocalFile(this.pathInfo.outputResolve(outputFileName), gameConfigSaveString, {force: true})
    printLog(" Completed " + ` (${gameConfigSaveString.length}) \t` + colors.bold(colors.gray(this.pathInfo.outputResolve(outputFileName))))
    printLog(` \u25B6 反编译 ${outputFileName} 文件成功. \n`, {isStart: true})
  }

  /**
   * 反编译小游戏的js文件
   * */
  private async decompileGameJS() {
    const _this = this
    let cont = 0
    const evalCodeList = [
      this.codeInfo.subContextJs,
      this.codeInfo.gameJs
    ].filter(Boolean)
    const allJsList = []
    const sandbox = {
      define(name: string, func: Function) {
        allJsList.push(name)
        _this._parseJsDefine(name, func)
        cont++
      },
      require() {
      },
    }
    evalCodeList.forEach(code => {
      const vm = createVM({sandbox})
      if (!code.includes('define(') || !code.includes('function(require, module, exports)')) return
      try {
        runVmCode(vm, code)
      } catch (e) {
        console.error(e.message)
      }
    })
    // console.log(allJsList)
    if (cont) {
      printLog(` \u25B6 反编译所有 js 文件成功. \n`)
    }
  }

  public async decompileAll() {
    super.decompileAll()
    /* 开始编译 */
    await this.initGame()
    await this.decompileGameJSON()
    await this.decompileGameJS()
    await this.decompileAppWorkers()
  }
}

