import * as cheerio from "cheerio";
import {CodeInfo, PathResolveInfo} from "@/type";
import {readLocalFile} from "@/utils/fs-process";

/**
 * 获取包中主要的一些代码文件
 * */
export function getPackCodeInfo(pathInfo: PathResolveInfo): CodeInfo {
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
    gameJs: __readFile(pathInfo.gameJsPath),
    gameJson: __readFile(pathInfo.gameJsonPath),
  }
}
