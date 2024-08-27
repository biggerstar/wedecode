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
    /* 将 header 的 buffer 数据单拎出来 */
    const headerBuffer = __APP_BUF__.subarray(0, 18)
    /* 获取头字节块起始标志, 固定值为 190 */
    let firstMark = headerBuffer.readUInt8(0);
    /* 获取文件开始的索引数据块位置，后面可通过该长度把源文件切出来   */
    let indexInfoLength = headerBuffer.readUInt32BE(5) + 18;
    /* 获取头字节块结束标志, 固定值为 237 */
    let lastMark = headerBuffer.readUInt8(13);
    /* 从 header 中读出当前包的文件数量 */
    let fileCount = headerBuffer.readUInt32BE(14);
    if (firstMark !== 0xbe || lastMark !== 0xed) {
      console.log(` \n\u274C ${colors.red(
        '这不是一个正确的小程序包,在微信3.8版本以下的 PC, MAC 包需要解密\n' +
        '所以你需要尝试先使用项目中的解密工具 decryption-tool/UnpackMiniApp.exe 解密')}\n地址:  https://github.com/biggerstar/wedecode'`
      )
      process.exit(0)
    }
    /* 将保存文件索引位置的数据 buffer 切出来 */
    const indexBuf = __APP_BUF__.subarray(14, indexInfoLength)
    let fileList = [], offset = 4;
    /* 遍历文件列表, 取出每个文件的路径和占用大小，并写入到文件系统中，  header 中每 12 个字节保存一个文件信息 */
    for (let i = 0; i < fileCount; i++) {
      const info: Record<any, any> = {};
      const nameLen = indexBuf.readUInt32BE(offset);
      offset += 4;
      info.path = indexBuf.toString('utf8', offset, offset + nameLen);
      offset += nameLen;
      info.off = indexBuf.readUInt32BE(offset);
      offset += 4;
      info.size = indexBuf.readUInt32BE(offset);
      offset += 4;
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
    let subPackRootPath = findCommonRoot(fileList.map(item => item.path))
    if (subPackRootPath) { // 重定向到子包目录
      pathInfo.setPackRootPath(subPackRootPath)
    }
    for (let info of fileList) {
      const fileName = info.path.startsWith("/") ? info.path.slice(1) : info.path
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
