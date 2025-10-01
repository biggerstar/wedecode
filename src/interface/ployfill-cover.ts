import path from "node:path";
import {glob} from "glob";
import {PloyfillItem} from "@/typings/index";

export class PloyFillCover {
  public readonly allPloyFills: PloyfillItem[] = []

  constructor(packPath: string) {
    const customHeaderPathPart = path.resolve(path.dirname(packPath), 'polyfill')
    const customPloyfillGlobMatch = path.resolve(customHeaderPathPart, './**/*.js')
    const customPloyfill: string[] = glob.globSync(customPloyfillGlobMatch)
    const customPloyfillInfo = customPloyfill.map(str => {
      return {fullPath: str, ployfillPath: path.relative(customHeaderPathPart, str)}
    })
    //  内置 polyfill
    const urls = new URL(import.meta.url)
    const headerPathPart = path.resolve(path.dirname(urls.pathname), 'polyfill')
    const ployfillGlobMatch = path.resolve(headerPathPart, './**/*.js')
    let builtinPloyfill: string[] = glob.globSync(ployfillGlobMatch)
    const builtinPloyfillInfo = builtinPloyfill.map(str => {
      return {fullPath: str, ployfillPath: path.relative(headerPathPart, str)}
    })
    this.allPloyFills = [...customPloyfillInfo, ...builtinPloyfillInfo]
  }

  public findPloyfill(targetPath: string): PloyfillItem {
    return this.allPloyFills.find(item => {
      return targetPath.endsWith(item.ployfillPath)
    })
  }
}
