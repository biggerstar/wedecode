import colors from "picocolors";
import {printLog} from "@/utils/common";
import {PackTypeMapping, UnPackInfo} from "@/type";
import {AppDecompilation} from "@/interface/AppDecompilation";
import {GameDecompilation} from "@/interface/GameDecompilation";
import {UnpackWxapkg} from "@/interface/UnpackWxapkg";
import path from "node:path";

/**
 * 反编译工具类入口
 * */
export class Decompilation {
  public readonly packPath: string
  public readonly outputPath: string
  public packInfo: UnPackInfo

  constructor(inputPath: string, outputPath?: string) {
    this.packPath = path.resolve(inputPath)
    this.outputPath = path.resolve(outputPath)
  }

  public async unpackWxapkg() {
    this.packInfo = await UnpackWxapkg.unpackWxapkg(this.packPath, this.outputPath)
  }

  public async decompileAll(options: { usePx?: boolean } = {}) {
    // TODO resolveAlias
    await this.unpackWxapkg()
    if (this.packInfo.appType === 'game') {
      // 小游戏
      const decompilationGame = new GameDecompilation(this.packInfo)
      await decompilationGame.decompileAll()
    } else {
      // 小程序
      const decompilationApp = new AppDecompilation(this.packInfo)
      decompilationApp.convertPlugin = true
      await decompilationApp.decompileAll(options)
    }
    printLog(`\n ✅  ${colors.bold(colors.green(PackTypeMapping[this.packInfo.packType] + '反编译结束!'))}`, {isEnd: true})
  }
}

