import colors from "picocolors";
import process from "node:process";
import fs from "node:fs";
import {findCommonRoot, getPathInfo, printLog} from "../common";
import {DecompilationBase} from "./DecompilationBase";
import * as cheerio from "cheerio";
import {DecompilationMicroApp} from "../DecompilationMicroApp";
import {CodeInfo} from "../type/type";

export abstract class UnpackWxapkg extends DecompilationBase{
  public readonly fileList: any[]
  public packType: 'main' | 'sub' | 'independent'     // 主包 | 分包 | 独立分包
  public appType: 'app' | 'game'
  public packPath: string
  public abstract pathInfo: ReturnType<typeof getPathInfo>
  public abstract outputPathInfo: ReturnType<typeof getPathInfo>
  
  protected constructor() {
    super();
    this.fileList = []
  }
  
  /**
   * 获取包中的文件列表, 包含开始和结束的字节信息
   * */
  public genFileList(__APP_BUF__: Buffer) {
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
    return fileList
  }

  /** 保存该包中的所有文件 */
  public async unpackWxapkg() {
    const __APP_BUF__ = fs.readFileSync(this.packPath)
    const fileList = this.genFileList(__APP_BUF__)
    this.fileList.splice(0, this.fileList.length, ...fileList)
    this.packType = 'sub'
    this.appType = 'app'
    const subPackRootPath = findCommonRoot(this.fileList.map(item => item.name))
    if (subPackRootPath) {
      this.pathInfo.setPackRootPath(subPackRootPath)
    }
    for (let info of this.fileList) {
      const fileName = info.name.startsWith("/") ? info.name.slice(1) : info.name
      const data = __APP_BUF__.subarray(info.off, info.off + info.size)
      /*------------------------------------------------*/
      const subRootPath = this.pathInfo.outputResolve(fileName)
      DecompilationBase.saveFile(subRootPath, data)
      /*------------------------------------------------*/
    }
    const appConfigJsonString = DecompilationBase.readFile(this.pathInfo.appConfigJsonPath)
    if (appConfigJsonString) {  // 独立分包也拥有自己的 app-config
      const appConfig: Record<any, any> = JSON.parse(appConfigJsonString)
      const foundThatSubPackages = (appConfig.subPackages || []).find((sub: any) => sub.root === `${subPackRootPath}/`)
      if (!foundThatSubPackages) {
        this.packType = 'main'
      } else if (typeof foundThatSubPackages === 'object' && foundThatSubPackages['independent']) {
        this.packType = 'independent'
      }
    }
    if (fs.existsSync(this.outputPathInfo.gameJsPath)) {
      this.appType = 'game'
    }
    printLog(`\n \u25B6 解小程序压缩包成功! 文件总数: ${colors.green(this.fileList.length)}`, {isStart: true})
  }

  public getPackCodeInfo(pathInfo: ReturnType<typeof getPathInfo>): CodeInfo{
    function readFile(path: string) {
      if (!path) return ''
      const content = DecompilationMicroApp.readFile(path)
      return content.length > 100 ? content : ''
    }

    let pageFrameHtmlCode = readFile(pathInfo.pageFrameHtmlPath)
    if (pageFrameHtmlCode) {
      const $ = cheerio.load(pageFrameHtmlCode);
      pageFrameHtmlCode = $('script').text()
    }
    const appServiceCode = readFile(pathInfo.appServicePath)
    const appServiceAppCode = readFile(pathInfo.appServiceAppPath)
    return {
      appConfigJson: readFile(pathInfo.appConfigJsonPath),
      appWxss: readFile(pathInfo.appWxssPath),
      appService: appServiceCode,
      appServiceApp: appServiceAppCode,
      pageFrame: readFile(pathInfo.pageFramePath),
      workers: readFile(pathInfo.workersPath),
      pageFrameHtml: pageFrameHtmlCode,
      gameJs: readFile(pathInfo.gameJsPath),
      gameJson: readFile(pathInfo.gameJsonPath),
    }
  }
}
