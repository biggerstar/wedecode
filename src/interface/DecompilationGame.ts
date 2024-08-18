import {VM} from 'vm2'
import colors from "picocolors";
import {readLocalFile, saveLocalFile} from "@/utils/fs-process";
import {createVM} from "@/utils/createVM";
import {jsBeautify, printLog, removeVM2ExceptionLine, sleep} from "@/utils/common";
import {UnPackInfo} from "@/type";
import {DecompilationBase} from "@/interface/DecompilationBase";

/**
 * 反编译工具类入口
 * */
export class DecompilationGame extends DecompilationBase {
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
    // pass
  }

  /**
   * 反编译 game.json 文件， 只有主包需要处理
   * */
  private async decompileGameJSON() {
    if (this.packType !== 'main') return
    await sleep(200)
    const appConfigString = this.codeInfo.appConfigJson
    const appConfig: Record<any, any> = JSON.parse(appConfigString)
    Object.assign(appConfig, appConfig.global)
    appConfig.plugins = {}
    const deleteKeys = [
      'openDataContext',
    ]
    deleteKeys.forEach(key => delete appConfig[key])

    const outputFileName = 'game.json'
    const gameConfigSaveString = JSON.stringify(appConfig, null, 2)
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

