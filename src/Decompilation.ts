import colors from "picocolors";
import path from "node:path";
import {printLog} from "@/utils/common";
import {PackTypeMapping, UnPackInfo} from "@/type";
import {DecompilationApp} from "@/interface/DecompilationApp";
import {DecompilationGame} from "@/interface/DecompilationGame";
import {UnpackWxapkg} from "@/interface/UnpackWxapkg";
import {DEFAULT_OUTPUT_PATH} from "@/constant";

/**
 * 反编译工具类入口
 * */
export class Decompilation {
  public packPath: string
  public outputPath: string
  public packInfo: UnPackInfo

  constructor(inputPath: string, outputPath?: string) {
    this.packPath = inputPath
    this.outputPath = outputPath
  }

  public async unpackWxapkg() {
    this.packInfo = await UnpackWxapkg.unpackWxapkg(this.packPath, this.outputPath)
  }

  public async decompileAll() {
    // TODO resolveAlias
    await this.unpackWxapkg()
    if (this.packInfo.appType === 'game') {
      // 小游戏
      const decompilationGame = new DecompilationGame(this.packInfo)
      await decompilationGame.decompileAll()
    } else {
      // 小程序
      const decompilationApp = new DecompilationApp(this.packInfo)
      decompilationApp.convertPlugin = true
      await decompilationApp.decompileAll()
    }
    printLog(`\n ✅  ${colors.bold(colors.green(PackTypeMapping[this.packInfo.packType] + '反编译结束!'))}`, {isEnd: true})
  }
}

