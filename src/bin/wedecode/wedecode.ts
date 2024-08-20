#!/usr/bin/env node

import {Command} from "commander";
import pkg from '../../../package.json';
import prompts from "../../utils/inquirer";
import {clearScreen, printLog, sleep} from "@/utils/common";
import {
  checkExistsWithFilePath,
  createNewVersionUpdateNotice,
  createSlogan,
  startCacheQuestionProcess,
  startCompilationProcess
} from "@/bin/wedecode/common";
import {DEFAULT_OUTPUT_PATH} from "@/constant";

const notice = createNewVersionUpdateNotice()
notice.query()

const program = new Command();

program
  .name('wedecode')
  .usage("<command> [options]")
  .description('\u25B6 wxapkg 反编译工具')
  .version(pkg.version)
  .option("-o, --out <out-path>", '指定编译输出地目录， 正常是主包目录')
  .option("--clear", '是否清空旧的产物')
  .action(async (argMap: Record<any, any>, options: Record<any, any>) => {
    await sleep(200)
    const args = options.args || []
    const hasArgs = !(args.length === 0)
    const config = {
      inputPath: args[0] || './',
      outputPath: argMap.out || DEFAULT_OUTPUT_PATH
    }
    clearScreen()
    await sleep(100)
    printLog(createSlogan(), {isStart: true});
    await notice.notice()
    /* ----------------------------------------------------------------------------- */
    if (!hasArgs) {
      const {inputPath, outputPath} = await prompts.questionPath()
      config.inputPath = inputPath || config.inputPath
      config.outputPath = outputPath || config.outputPath
    }
    if (!checkExistsWithFilePath(config.inputPath, {throw: true})) return
    // 经过下面转换， 文件输出位置最终都会在改小程序包同级目录下的 __OUTPUT__ 文件夹中输出
    await startCacheQuestionProcess(argMap.clear, config.inputPath, config.outputPath)
    await startCompilationProcess(config.inputPath, config.outputPath)
  })

program.parse();
