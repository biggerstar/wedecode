import inquirer from "inquirer";
import colors from "picocolors";
import path from "node:path";
import {checkExistsWithFilePath} from "./common";

type PromptsOptType = {
  message?: string
}

const prompts = {
  async default() {
    return inquirer['prompt'](
      [
        // {
        //   type: 'list',
        //   message: '请选择反编译模式: ',
        //   name: 'mode',
        //   choices: [
        //     '单包模式',
        //     '分包模式',
        //   ],
        // },
        {
          type: 'waitUserInput',
          message: `wxapkg 文件' 或 '目录' 路径, 默认当前所在整个目录: `,
          name: 'inputPath',
          validate(input: any, _): any {
            return checkExistsWithFilePath(path.resolve(input),{throw:true});
          },
        },
        {
          type: 'waitUserInput',
          message: `请输入输出目录, 默认和输入目录同级: `,
          name: 'outputPath',
        },
      ]
    )
  },
  isClearOldCache(cachePath=''){
    return inquirer['prompt'](
      [
        {
          type: 'list',
          message: `输出目录中存在上次旧的编译产物，是否覆盖 ?  ${cachePath}`,
          name: 'isClearCache',
          choices: [
            '覆盖',
            '跳过',
          ],
        },
      ]
    )
  }
}
export default prompts
