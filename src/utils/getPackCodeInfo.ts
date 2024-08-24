import * as cheerio from "cheerio";
import {AppCodeInfo, GameCodeInfo, PathResolveInfo} from "@/type";
import {readLocalFile} from "@/utils/fs-process";

/**
 * 获取 APP 包中主要的一些代码文件
 * @param pathInfo
 * @param opt
 * @param opt.adaptLen 小于该长度的内容认为空
 * */
export function getAppPackCodeInfo(pathInfo: PathResolveInfo, opt: { adaptLen?: number } = {}): AppCodeInfo {
  const {adaptLen = 100} = opt || {}

  function __readFile(path: string) {
    if (!path) return ''
    const content = readLocalFile(path)
    return content.length > adaptLen ? content : ''
  }

  let pageFrameHtmlCode = __readFile(pathInfo.pageFrameHtmlPath)
  if (pageFrameHtmlCode) {
    const $ = cheerio.load(pageFrameHtmlCode);
    pageFrameHtmlCode = $('script').text()
  }
  const appServiceCode = __readFile(pathInfo.appServicePath)
  const appServiceAppCode = __readFile(pathInfo.appServiceAppPath)
  return {
    appConfigJson: __readFile(pathInfo.appConfigJsonPath),
    appWxss: __readFile(pathInfo.appWxssPath),
    appService: appServiceCode,
    appServiceApp: appServiceAppCode,
    pageFrame: __readFile(pathInfo.pageFramePath),
    workers: __readFile(pathInfo.workersPath),
    pageFrameHtml: pageFrameHtmlCode,
  }
}

/**
 * 获取 GAME 包中主要的一些代码文件
 * */
export function getGamePackCodeInfo(pathInfo: PathResolveInfo, opt: { adaptLen?: number } = {}): GameCodeInfo {
  const {adaptLen = 100} = opt || {}
  
  function __readFile(path: string) {
    if (!path) return ''
    const content = readLocalFile(path)
    return content.length > adaptLen ? content : ''
  }

  return {
    workers: __readFile(pathInfo.workersPath),
    gameJs: __readFile(pathInfo.gameJsPath),
    appConfigJson: __readFile(pathInfo.appConfigJsonPath),
    subContextJs: __readFile(pathInfo.subContextJsPath),
  }
}
