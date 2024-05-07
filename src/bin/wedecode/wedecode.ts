import {Command} from "commander";
import packages from '../../../package.json';
import path from 'node:path';
import fs from 'node:fs';
import process from "node:process";
import colors from 'picocolors'
import {DecompilationMicroApp} from "../../decompilation";
import {clearScreen, printLog, sleep} from "../../common";
import prompts from "../../inquirer";

const program = new Command();

program
  .name('wedecode')
  .description('\u25B6 wxapkg 解包工具')
  .version(packages.version)
  .action(async (argMap: Record<any, any>, options: Record<any, any>) => {
    await sleep(200)
    const args = options.args || []
    const hasArgs = !(args.length === 0 && Object.keys(argMap).length === 0)

    clearScreen()
    printLog(colors.bgRed(colors.yellow(`\n\t🔶  \t  ${colors.bold('小程序反编译工具 wxapp-unpack')}\t\t🔶\t\n`)), {
      isStart: true,
      space1: '\n',
      space2: '\n',
      nativeOnly: true,
    })

    async function singlePackMode(filePath: string) {
      if (path.extname(filePath) !== '.wxapkg') {
        console.log(colors.red('\u274C  不是一个包'), filePath)

        return
      }
      const decompilationMicroApp = new DecompilationMicroApp(filePath)
      await decompilationMicroApp.decompileAll()
    }

    let targetPath = ''
    const packageName = args[0]
    if (!hasArgs) {
      const {path}: Record<any, any> = await prompts.default()
      targetPath = path
    } else if (packageName) {
      targetPath = packageName
    }
    targetPath = path.resolve(process.cwd(), targetPath)
    if (!fs.existsSync(targetPath)) {
      console.log(colors.red('\u274C  路径不存在'), targetPath)
      return
    }
    const isDirectory = fs.statSync(targetPath).isDirectory()
    printLog(`\n \u25B6 当前操作类型: ${colors.yellow(isDirectory ? '分包模式' : '单包模式')}`, {isEnd: true})

    if (isDirectory) {
      const wxapkgPathList = fs.readdirSync(targetPath).filter(str => {
        return path.extname(str) === '.wxapkg' && fs.statSync(path.resolve(targetPath, str)).isFile()
      })
      if (!wxapkgPathList.length) {
        console.log(colors.red('\u274C  路径不存在'), targetPath)
      }
      for (const packPath of wxapkgPathList) {   // 目录( 多包 )
        await singlePackMode(path.resolve(targetPath, packPath))
      }
    } else {  // 文件 ( 单包 )
      await singlePackMode(targetPath)
    }
  })

program.parse();
