import inquirer from "inquirer";
import fs from 'node:fs'
import colors from "picocolors";
import path from "node:path";

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
          message: `${colors.blue('[自动判断单包或分包] ')} - 粘贴反编译的 '文件' 或 '目录'  路径: `,
          name: 'path',
          validate(input: any, _): any {
            if (!input) return
            const targetPath = path.resolve(input)
            if (!fs.existsSync(targetPath)) {
              console.log(`\n${colors.red('\u274C   文件或目录不存在, 请检查!')}`)
              return ''
            }
            return true
          },
        },
        {
          type: 'waitUserInput',
          message: `请输入输出目录, 默认和输入目录同级: `,
          name: 'outPath',
        },
      ]
    )
  },
}
export default prompts
