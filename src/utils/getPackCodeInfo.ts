import * as cheerio from "cheerio";
import {AppCodeInfo, GameCodeInfo, PathResolveInfo} from "@/type";
import {readLocalFile} from "@/utils/fs-process";

/**
 * 获取包中主要的一些代码文件
 * */
export function getAppPackCodeInfo(pathInfo: PathResolveInfo): AppCodeInfo {
  function __readFile(path: string) {
    if (!path) return ''
    const content = readLocalFile(path)
    return content.length > 100 ? content : ''
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
 * 获取包中主要的一些代码文件
 * */
export function getGamePackCodeInfo(pathInfo: PathResolveInfo): GameCodeInfo {
  function __readFile(path: string) {
    if (!path) return ''
    const content = readLocalFile(path)
    return content.length > 100 ? content : ''
  }

  return {
    workers: __readFile(pathInfo.workersPath),
    gameJs: __readFile(pathInfo.gameJsPath),
    appConfigJson: __readFile(pathInfo.appConfigJsonPath),
    subContextJs: __readFile(pathInfo.subContextJsPath),
  }
}
