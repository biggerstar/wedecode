import colors from "picocolors";
import process from "node:process";
import fs from "node:fs";
import {findCommonRoot, getPathResolveInfo, printLog} from "@/utils/common";
import {readLocalFile, saveLocalFile} from "@/utils/fs-process";
import {MiniAppType, MiniPackType, UnPackInfo} from "@/type";

/**
 * 用于解包
 * */
export class UnpackWxapkg {
  /**
   * 获取包中的文件列表, 包含开始和结束的字节信息
   * */
  private static genFileList(__APP_BUF__: Buffer) {
    const headerBuffer = __APP_BUF__.subarray(0, 14)
    /* 获取头字节数据 */
    let firstMark = headerBuffer.readUInt8(0);
    let infoListLength = headerBuffer.readUInt32BE(5);
    // let dataLength = headerBuffer.readUInt32BE(9);
    let lastMark = headerBuffer.readUInt8(13);
    if (firstMark !== 0xbe || lastMark !== 0xed) {
      console.log(` \n\u274C ${colors.red(
        '这不是一个正确的小程序包,在微信3.8版本以下的 PC, MAC 包需要解密\n' +
        '所以你需要尝试先使用项目中的解密工具 decryption-tool/UnpackMiniApp.exe 解密')}\n地址:  https://github.com/biggerstar/wedecode'`
      )
      process.exit(0)
    }
    const buf = __APP_BUF__.subarray(14, infoListLength + 14)
    let fileCount = buf.readUInt32BE(0);
    let fileList = [], off = 4;
    for (let i = 0; i < fileCount; i++) {
      let info: Record<any, any> = {};
      let nameLen = buf.readUInt32BE(off);
      off += 4;
      info.name = buf.toString('utf8', off, off + nameLen);
      off += nameLen;
      info.off = buf.readUInt32BE(off);
      off += 4;
      info.size = buf.readUInt32BE(off);
      off += 4;
      fileList.push(info);
    }
    if (!fileList.length) {
      printLog(colors.red('\u274C  未成功解压小程序包.'))
      process.exit(0)
    }
    return fileList
  }

  /** 
   * 解析并保存该包中的所有文件 
   * 返回获取该包各种信息 和 路径的操作对象
   * */
  public static async unpackWxapkg(inputPath: string, outputPath: string): Promise<UnPackInfo> {
    const __APP_BUF__ = fs.readFileSync(inputPath)
    const fileList = []
    fileList.splice(0, fileList.length, ...UnpackWxapkg.genFileList(__APP_BUF__))
    const pathInfo = getPathResolveInfo(outputPath) // 这个后面在解压完包的时候会进行分包路径重置,并永远指向分包
    const outputPathInfo = getPathResolveInfo(outputPath) // 这个永远指向主包
    let packType: MiniPackType = 'sub'
    let appType: MiniAppType = 'app'
    let subPackRootPath = findCommonRoot(fileList.map(item => item.name))
    if (subPackRootPath) { // 重定向到子包目录
      pathInfo.setPackRootPath(subPackRootPath)
    }
    for (let info of fileList) {
      const fileName = info.name.startsWith("/") ? info.name.slice(1) : info.name
      const data = __APP_BUF__.subarray(info.off, info.off + info.size)
      /*------------------------------------------------*/
      const subRootPath = pathInfo.outputResolve(fileName)
      saveLocalFile(subRootPath, data)
      /*------------------------------------------------*/
    }
    const appConfigJsonString = readLocalFile(pathInfo.appConfigJsonPath)
    if (appConfigJsonString) {  // 独立分包也拥有自己的 app-config
      const appConfig: Record<any, any> = JSON.parse(appConfigJsonString)
      const foundThatSubPackages = (appConfig.subPackages || []).find((sub: any) => sub.root === `${subPackRootPath}/`)
      if (!foundThatSubPackages) {
        packType = 'main'
      } else if (typeof foundThatSubPackages === 'object' && foundThatSubPackages['independent']) {
        packType = 'independent'
      }
    }
    if (fs.existsSync(outputPathInfo.gameJsPath)) {
      appType = 'game'
    }
    printLog(`\n \u25B6 解小程序压缩包成功! 文件总数: ${colors.green(fileList.length)}`, {isStart: true})
    return {
      appType,
      packType,
      subPackRootPath,
      pathInfo,
      outputPathInfo,
      inputPath,
      outputPath,
    }
  }
}
