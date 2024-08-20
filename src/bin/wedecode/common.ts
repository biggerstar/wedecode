import fs from "node:fs";
import {printLog, sleep} from "@/utils/common";
import {glob} from "glob";
import colors from "picocolors";
import path from "node:path";
import {Decompilation} from "@/Decompilation";
import pkg from "../../../package.json";
import checkForUpdate from "update-check";
import {DEFAULT_OUTPUT_PATH} from "@/constant";
import prompts from "@/utils/inquirer";
import figlet from "figlet";
import {CacheClearEnum} from "@/bin/wedecode/enum";

/**
 * 查询是否有新版本
 * */
export function createNewVersionUpdateNotice(): {
  query(): void
  notice(): Promise<void>
} {
  let updateInfo: Record<any, any> | null
  return {
    /** 进行查询 */
    query() {
      checkForUpdate(pkg).then(res => updateInfo = res).catch(() => void 0)
    },
    /**
     * 异步使用， 时间错开，因为查询需要时间， 如果查询到新版本， 则进行通知
     * 基于 update-check 如果本次查到更新但是没通知， 下次启动将会从缓存中获取版本信息并通知
     * */
    async notice() {
      await sleep(200)
      if (updateInfo && updateInfo.latest) {
        printLog(`
    🎉  wedecode 有新版本:  v${pkg.version}  ==>  v${updateInfo.latest}
    🎄  您可以直接使用  ${colors.blue('npm i wedecode -g')}  进行更新
    💬  npm地址:  https://www.npmjs.com/package/wedecode  
      \n`, {
          isStart: true,
        })
      } else {
        printLog(`
              🎄  当前使用版本:  v${pkg.version}
      \n`, {
          isStart: true,
        })
      }
    }
  }
}
/**
 * 创建 slogan 大字横幅
 * */
export function createSlogan(str: string = '    wedecode'): string {
  const slogan = figlet.textSync(str, {
    horizontalLayout: "default",
    verticalLayout: "default",
    whitespaceBreak: true,
  })
  return colors.bold(colors.yellow(slogan))
}

/**
 * 进行单包反编译
 * @param {String} wxapkgPath   wxapkg包路径
 * @param {String} outputPath  输出目录
 * */
async function singlePackMode(wxapkgPath: string, outputPath: string): Promise<void> {
  const decompilationMicroApp = new Decompilation(wxapkgPath, outputPath)
  await decompilationMicroApp.decompileAll()
}

/**
 * 启动编译流程
 * ]*/
export async function startCompilationProcess(inputPath: string, outputPath: string): Promise<void> {
  const isDirectory = fs.statSync(inputPath).isDirectory()
  printLog(`\n \u25B6 当前操作类型: ${colors.yellow(isDirectory ? '分包模式' : '单包模式')}`, {isEnd: true})
  if (isDirectory) {
    const wxapkgPathList = glob.globSync(`${inputPath}/*.wxapkg`)
    for (const packPath of wxapkgPathList) {   // 目录( 多包 )
      await singlePackMode(packPath, outputPath)
    }
  } else {  // 文件 ( 单包 )
    await singlePackMode(inputPath, outputPath)
  }
  printLog(` ✅  ${colors.bold(colors.green('编译流程结束!'))}`, {isEnd: true})
  process.exit(0)
}


/**
 * 询问是否清空旧产物
 * @param {Boolean} isClear 外部指定是否进行清空
 * @param inputPath
 * @param outputPath
 * */
export async function startCacheQuestionProcess(isClear: boolean, inputPath: string, outputPath: string): Promise<void> {
  const OUTPUT_PATH = path.join(path.dirname(inputPath), outputPath)
  if (fs.existsSync(OUTPUT_PATH)) {
    const isClearCache = isClear ? CacheClearEnum.clear : (await prompts.isClearOldCache(OUTPUT_PATH))['isClearCache']
    if (isClearCache === CacheClearEnum.clear || isClear) {
      fs.rmSync(OUTPUT_PATH, {recursive: true})
      printLog(`\n \u25B6 移除旧产物成功 `)
    }
  }
}

export function checkExistsWithFilePath(targetPath: string, opt: { throw?: boolean } = {}): boolean {
  const printErr = (log: string) => {
    console.log('\n输入路径: ', colors.yellow(path.resolve(targetPath)));
    opt.throw && console.log(`${colors.red(`\u274C   ${log}`)}\n`)
  }
  if (!fs.existsSync(targetPath)) {
    printErr('文件 或者 目录不存在, 请检查!')
    return false
  }
  const isDirectory = fs.statSync(targetPath).isDirectory()
  if (isDirectory) {
    const wxapkgPathList = glob.globSync(`${targetPath}/*.wxapkg`)
    if (!wxapkgPathList.length) {
      console.log(
        '\n',
        colors.red('\u274C  文件夹下不存在 .wxapkg 包'),
        colors.yellow(path.resolve(targetPath)),
        '\n')
      return false
    }
  }
  return true
}


