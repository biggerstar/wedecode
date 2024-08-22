import fs from "node:fs";
import {printLog} from "@/utils/common";
import colors from "picocolors";
import {glob} from "glob";
import {AppMainPackageNames} from "@/bin/wedecode/enum";
import {Decompilation} from "@/interface/Decompilation";
import {deepmerge} from "@biggerstar/deepmerge";

export type DecompilationControllerState = {
  usePx: boolean,
}

export class DecompilationController {
  public readonly inputPath: string
  public readonly outputPath: string
  public config: DecompilationControllerState
  constructor(inputPath: string, outputPath: string) {
    if (!inputPath) {
      throw new Error('inputPath 是必须的')
    }
    if (!outputPath) {
      throw new Error('outputPath 是必须的')
    }
    this.inputPath = inputPath
    this.outputPath = outputPath
    this.config = {
      usePx: false,
    }
  }
  
  public setState(opt: Partial<DecompilationControllerState>){
    deepmerge(this.config, opt)    
  }

  /**
   * 单包反编译
   * */
  async singlePackMode(wxapkgPath: string, outputPath: string): Promise<void> {
    const decompilation = new Decompilation(wxapkgPath, outputPath)
    await decompilation.decompileAll({
      usePx: this.config.usePx,
    })
  }

  /**
   * 启动反编译流程
   * ]*/
  async startDecompilerProcess(): Promise<void> {
    const isDirectory = fs.statSync(this.inputPath).isDirectory()
    printLog(`\n \u25B6 当前操作类型: ${colors.yellow(isDirectory ? '分包模式' : '单包模式')}`, {isEnd: true})
    if (isDirectory) {
      const wxapkgPathList = glob.globSync(`${this.inputPath}/*.wxapkg`)
      wxapkgPathList.sort((_pathA, _b) => {
        const foundMainPackage = AppMainPackageNames.find(fileName => _pathA.endsWith(fileName))
        if (foundMainPackage) return -1; // 将 'APP.png' 排到前面, 保证第一个解析的是主包
        return 0;
      });
      for (const packPath of wxapkgPathList) {   // 目录( 多包 )
        await this.singlePackMode(packPath, this.outputPath)
      }
    } else {  // 文件 ( 单包 )
      await this.singlePackMode(this.inputPath, this.outputPath)
    }
    printLog(` ✅  ${colors.bold(colors.green('编译流程结束!'))}`, {isEnd: true})
  }
}
