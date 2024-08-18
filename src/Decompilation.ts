import colors from "picocolors";
import path from "node:path";
import {printLog} from "@/utils/common";
import {PackTypeMapping, UnPackInfo} from "@/type";
import {DecompilationApp} from "@/interface/DecompilationApp";
import {DecompilationGame} from "@/interface/DecompilationGame";
import {UnpackWxapkg} from "@/interface/UnpackWxapkg";

/**
 * 反编译工具类入口
 * */
export class Decompilation {
  public packPath: string
  public outputPath: string
  public packInfo: UnPackInfo

  constructor(inputPath: string, outputPath?: string) {
    if (path.extname(inputPath) !== '.wxapkg') {
      console.log(colors.red('\u274C  文件夹下不存在 .wxapkg 包'), inputPath)
      return
    }
    if (!outputPath) outputPath = path.resolve(path.dirname(inputPath), '__OUTPUT__') // 未指定输出目录则默认输出到同级目录
    else outputPath = path.resolve(outputPath) // 解析用户自定义的输出目录
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

