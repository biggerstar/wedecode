import {Command} from "commander";
import packages from '../../../package.json';
import path from 'node:path';
import fs from 'node:fs';
import process from "node:process";
import colors from 'picocolors'
import {DecompilationMicroApp} from "../../decompilation";

const program = new Command();

program
  .name('wedecode')
  .description('\u25B6 wxapkg 解包工具')
  .version(packages.version)
  .action(async (argMap: Record<any, any>, options: Record<any, any>) => {
    const args = options.args || []
    if (args.length === 0 && Object.keys(argMap).length === 0) {
      program.help()
      return
    }
    /*-----------------------------------------------------*/
    const packageName = args[0]
    const targetPath = path.resolve(process.cwd(), packageName)
    if (fs.existsSync(targetPath)) {
      const ifFile = fs.statSync(targetPath).isFile()
      if (!ifFile) {
        console.log(colors.red(`\u25B6 路径指向应该是个文件， 如果你想要反编译目录， 请使用 ${colors.blue('unpkg-apps')} 命令`), targetPath)
        return
      }
      const decompilationMicroApp = new DecompilationMicroApp(targetPath)
      decompilationMicroApp.decompileAll().then()
    } else {
      console.log(colors.red('\u25B6 文件路径不存在'), targetPath)
    }
  })

program.parse();

