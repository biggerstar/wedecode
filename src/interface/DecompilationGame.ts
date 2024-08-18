import {VM} from 'vm2'
import colors from "picocolors";
import {readLocalFile, saveLocalFile} from "@/utils/fs-process";
import {createVM} from "@/utils/createVM";
import {jsBeautify, printLog, removeVM2ExceptionLine, sleep} from "@/utils/common";
import {GameCodeInfo, UnPackInfo} from "@/type";
import {DecompilationBase} from "@/interface/DecompilationBase";
import {getGamePackCodeInfo} from "@/utils/getPackCodeInfo";

/**
 * 反编译工具类入口
 * */
export class DecompilationGame extends DecompilationBase {
  private codeInfo: GameCodeInfo
  private rootCodeInfo: GameCodeInfo
  public wxsList: any[]
  public allRefComponentList: string[] = []
  public allSubPackagePages: string[] = []
  public allPloyFill: { fullPath: string, ployfillPath: string }[] = []

  public constructor(packInfo: UnPackInfo) {
    super(packInfo);
  }

  /**
   * 为分包注入主包的环境代码, 自动分辨注入小程序或者小游戏代码
   * */
  private injectMainPackCode(vm: VM) {
    if (this.packType === 'main') return
    let baseEnvGameCode1 = this.rootCodeInfo.gameJs
    try {
      if (baseEnvGameCode1) vm.run(baseEnvGameCode1)
    } catch (e) {
    }
  }

  /**
   * 初始化小游戏所需环境和变量
   * */
  private async initGame() {
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
    this.codeInfo = getGamePackCodeInfo(this.pathInfo)
    this.rootCodeInfo = getGamePackCodeInfo(this.pathInfo)
    await sleep(200)
    const gameConfigString = this.codeInfo.gameJson
    const gameConfig: Record<any, any> = JSON.parse(gameConfigString)
    Object.assign(gameConfig, gameConfig.global)
    gameConfig.plugins = {}
    const deleteKeys = [
      'openDataContext',
    ]
    deleteKeys.forEach(key => delete gameConfig[key])

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
    const _this_game = this
    const vm = createVM({
      sandbox: {
        define(name: string, func: string) {
          /* 看看是否有 polyfill,  有的话直接使用注入 polyfill */
          const foundPloyfill = _this_game.allPloyFill.find(item => {
            return name.endsWith(item.ployfillPath)
          })
          let resultGameCode: string = ''
          if (foundPloyfill) {
            resultGameCode = readLocalFile(foundPloyfill.fullPath)
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
            saveLocalFile(_this_game.pathInfo.outputResolve(name), removeVM2ExceptionLine(resultGameCode), {force: true})
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
      } catch (e) {

      }
    }
  }

  public async decompileAll() {
    super.decompileAll()
    /* 开始编译 */
    await this.initGame()
    await this.decompileGameJSON()
    await this.decompileGameJS()
    /* ----------------------------------- */
    await this.decompileAppWorker()
    await this.generaProjectConfigFiles()
    await this.removeCache()
  }
}

