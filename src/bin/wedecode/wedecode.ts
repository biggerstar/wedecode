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
  .option("--open-dir", ' 结束编译后打开查看产物目录')
  .option("--clear", '是否清空旧的产物')
  .option("--px", '是否使用 px 像素单位解析 css， 默认使用的是 rpx 单位')
  .option("--unpack-only", '是否只进行解包，不进行反编译')
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
