#!/usr/bin/env node

import {Command} from "commander";
import pkg from '../../../package.json';
import {clearScreen, printLog, sleep} from "@/utils/common";
import {
  createNewVersionUpdateNotice,
  createSlogan,
} from "@/bin/wedecode/common";
import {startMainCommanderProcess} from "@/bin/wedecode/mainCommanderProcess";

const notice = createNewVersionUpdateNotice()
notice.query()

const program = new Command();

program
  .name('wedecode')
  .usage("<command> [options]")
  .description('\u25B6 wxapkg 反编译工具')
  .version(pkg.version)
  .option("-o, --out <out-path>", '指定编译输出地目录， 正常是主包目录')
  .option("--openDir", ' 是否打开查看编译后的产物目录')
  .option("--clear", '是否清空旧的产物')
  .action(async (argMap: Record<any, any>, options: Record<any, any>) => {
    await sleep(200)
    const args = options.args || []
    clearScreen()
    await sleep(100)
    printLog(createSlogan(), {isStart: true});
    await notice.notice()
    /* ----------------------------------开始交互页面------------------------------------- */
    await startMainCommanderProcess(args, argMap)
    process.exit(0)
  })

program.parse();
