import fs from "node:fs";
import { getPathResolveInfo, printLog } from "@/utils/common";
import { AppMainPackageNames, isDev } from "@/bin/wedecode/enum";
import { readLocalFile } from "@/utils/fs-process";
import { WxAppInfoUtils } from "@/utils/wxapp-info";
import { ProjectConfigUtils } from "@/utils/project-config";
import { GameDecompilation } from "@/interface/game-decompilation";
import { AppDecompilation } from "@/interface/app-decompilation";
import { DecompilationControllerState, PackTypeMapping, PathResolveInfo, PackageInfoResult } from "@/typings/index";
import { UnpackWxapkg } from "@/interface/unpack-wxapkg";
import { FileCleanerUtils } from "@/utils/file-cleaner";
import { DefaultFilesGeneratorUtils } from "@/utils/default-files-generator";

import colors from "picocolors";
import { glob } from "glob";
import path from "node:path";


class DecompilationController {
  public readonly inputPath: string
  public readonly outputPath: string
  public readonly workspaceId?: string
  public config: DecompilationControllerState
  public readonly pathInfo: PathResolveInfo
  private firstPackInfo: any = null // 保存第一个包的信息，用于获取小程序信息

  constructor(inputPath: string, outputPath: string, workspaceId?: string) {
    if (!inputPath) {
      throw new Error('inputPath 是必须的')
    }
    if (!outputPath) {
      throw new Error('outputPath 是必须的')
    }
    this.inputPath = path.resolve(inputPath)
    this.outputPath = path.resolve(outputPath)
    this.workspaceId = workspaceId
    this.pathInfo = getPathResolveInfo(this.outputPath)
    this.config = {
      usePx: false,
      unpackOnly: false
    }
  }

  public setState(opt: Partial<DecompilationControllerState>) {
    Object.assign(this.config, opt)
  }

  /**
   * 单包反编译
   * */
  private async singlePackMode(wxapkgPath: string, outputPath: string): Promise<void> {
    const packInfo = await UnpackWxapkg.unpackWxapkg(wxapkgPath, outputPath)
    
    // 保存第一个包的信息，用于后续获取小程序信息
    if (!this.firstPackInfo) {
      this.firstPackInfo = packInfo
    }
    
    if (this.config.unpackOnly) return
    if (packInfo.appType === 'game') {
      // 小游戏
      const decompilationGame = new GameDecompilation(packInfo)
      await decompilationGame.decompileAll()
    } else {
      // 小程序
      const decompilationApp = new AppDecompilation(packInfo)
      decompilationApp.convertPlugin = true
      await decompilationApp.decompileAll({
        usePx: this.config.usePx,
      })
    }
    printLog(`\n ✅  ${colors.bold(colors.green(PackTypeMapping[packInfo.packType] + '反编译结束!'))}`, { isEnd: true })

  }

  /**
   * 尝试获取并更新小程序信息
   */
  private async tryGetAndUpdateAppInfo(packInfo: any): Promise<void> {
    await WxAppInfoUtils.tryGetAndUpdateAppInfoFromPack(this.workspaceId, packInfo, 3000, this.config.wxid);
  }

  /**
   * 启动反编译流程
   * ]*/
  public async startDecompilerProcess(): Promise<void> {
    const isDirectory = fs.statSync(this.inputPath).isDirectory()
    printLog(`\n \u25B6 当前操作类型: ${colors.yellow(isDirectory ? '分包模式' : '单包模式')}`, { isEnd: true })
    // await this.startJob()
    if (isDirectory) {
      // 首先尝试查找 .wxapkg 文件
      let wxapkgPathList = glob.globSync(`${this.inputPath}/*.wxapkg`)
      
      // 如果没有找到 .wxapkg 文件，则处理目录中的所有文件
      if (wxapkgPathList.length === 0) {
        const allFiles = fs.readdirSync(this.inputPath).map(file => path.join(this.inputPath, file))
        wxapkgPathList = allFiles.filter(filePath => {
          const stats = fs.statSync(filePath)
          return stats.isFile() // 只处理文件，不处理目录
        })
      }
      
      wxapkgPathList.sort((_pathA, _b) => {
        const foundMainPackage = AppMainPackageNames.find(fileName => _pathA.endsWith(fileName))
        if (foundMainPackage) return -1; // 将 'APP.wxapkg' 排到前面, 保证第一个解析的是主包
        return 0;
      });
      for (const packPath of wxapkgPathList) {   // 目录( 多包 )
        await this.singlePackMode(packPath, this.outputPath)
      }
    } else {  // 文件 ( 单包 )
      await this.singlePackMode(this.inputPath, this.outputPath)
    }
    await this.endingAllJob()
  }

  /**
   * 生成项目配置文件
   * */
  protected async generaProjectConfigFiles() {
    await ProjectConfigUtils.generateProjectConfigFiles(this.outputPath);
  }



  /**
   * 生成组件构成必要素的默认 json wxs, wxml, wxss 文件
   * */
  private async generateDefaultAppFiles() {
    await DefaultFilesGeneratorUtils.generateDefaultAppFiles(this.outputPath);
  }

  /**
   * 缓存移除
   * */
  protected async removeCache() {
    await FileCleanerUtils.removeCache(this.outputPath);
  }

  /**
   * 收尾工作
   * */
  private async endingAllJob(): Promise<void> {
    // 在解包模式下，也尝试获取小程序信息
    if (this.firstPackInfo) {
      await this.tryGetAndUpdateAppInfo(this.firstPackInfo)
    }
    
    if (this.config.unpackOnly) {
      printLog(` ✅  ${colors.bold(colors.green('解包流程结束!'))}`, { isEnd: true })
      return
    }
    
    await this.generateDefaultAppFiles()
    await this.generaProjectConfigFiles()
    
    if (!isDev) {
      await this.removeCache()
    }
    printLog(` ✅  ${colors.bold(colors.green('编译流程结束!'))}`, { isEnd: true })
  }
}

export default DecompilationController;
