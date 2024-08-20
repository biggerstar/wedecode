import inquirer from "inquirer";
import path from "node:path";
import colors from "picocolors";
import {checkExistsWithFilePath} from "@/bin/wedecode/common";
import {DEFAULT_OUTPUT_PATH} from "@/constant";
import {CacheClearEnum, OperationModeEnum} from "@/bin/wedecode/enum";

const prompts = {
  async selectMode(){
    return inquirer['prompt'](
      [
        {
          type: 'list',
          message: `请选择操作模式 ?`,
          name: 'selectMode',
          choices: [
            OperationModeEnum.autoScan,
            OperationModeEnum.manualScan,
          ],
        },
      ]
    )
  },
  async questionPath() {
    return inquirer['prompt'](
      [
        {
          type: 'input',
          message: `输入 ${colors.blue('wxapkg文件')} 或 ${colors.blue('目录')} 默认为( ${colors.yellow('./')} ): `,
          name: 'inputPath',
          validate(input: any, _): any {
            return checkExistsWithFilePath(path.resolve(input), {throw: true});
          },
        },
        {
          type: 'input',
          message: `输出目录, 默认为( ${colors.yellow(DEFAULT_OUTPUT_PATH)} ): `,
          name: 'outputPath',
        },
      ]
    )
  },
  isClearOldCache(cachePath = '') { 
    return inquirer['prompt'](
      [
        {
          type: 'list',
          message: `输出目录中存在上次旧的编译产物，是否清空 ? \n  ${colors.blue(`当前缓存路径( ${colors.yellow(cachePath)} )`)}`,
          name: 'isClearCache',
          choices: [
            CacheClearEnum.clear,
            CacheClearEnum.notClear,
          ],
        },
      ]
    )
  },
}
export default prompts
