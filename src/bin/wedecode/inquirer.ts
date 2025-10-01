import inquirer from "inquirer";
import path from "node:path";
import colors from "picocolors";
import {checkExistsWithFilePath, internetAvailable} from "@/bin/wedecode/common";
import {PUBLIC_OUTPUT_PATH} from "@/constant/index";
import {CacheClearEnum, YesOrNoEnum, OperationModeEnum} from "@/bin/wedecode/enum";
// @ts-ignore
import {SelectTableTablePrompt} from "@biggerstar/inquirer-selectable-table";
import {clearScreen, sleep} from "@/utils/common";
import process from "node:process";
import {ScanTableOptions} from "@/typings/index";

inquirer.registerPrompt("table", SelectTableTablePrompt);
process.stdout.setMaxListeners(200)

async function onResize() {
  if (lastTableOptions) {
    await prompts.showScanPackTable(lastTableOptions)
    clearScreen()
  }
}

let lastTableOptions: ScanTableOptions = null
let online: boolean = false

async function checkOnline() {
  online = await internetAvailable()
}

setTimeout(checkOnline, 0)

const prompts = {
  async selectMode() {
    const offlineTip: string = `( ${colors.yellow('联网可显示小程序信息')} )`
    const onlineTip: string = `( ${colors.green('网络正常')} )`
    await sleep(1000)
    return inquirer['prompt'](
      [
        {
          type: 'list',
          message: `请选择操作模式 ? ${!online ? offlineTip : onlineTip}`,
          name: 'selectMode',
          choices: [
            OperationModeEnum.autoScan,
            OperationModeEnum.manualScan,
            OperationModeEnum.manualDir,
          ],
        },
      ]
    )
  },
  async inputManualScanPath() {
    return inquirer['prompt'](
      [
        {
          type: 'input',
          message: `输入您要扫描的小程序包路径 ( ${colors.yellow('.')} 表示使用当前路径 ): `,
          name: 'manualScanPath',
          validate(input: any) {
            if (!input) return false
            return checkExistsWithFilePath(input, {throw: true, checkWxapkg: false, showInputPathLog: false});
          }
        },
      ]
    )
  },
  async showDangerScanPrompt(_path: string) {
    return inquirer['prompt'](
      [
        {
          type: 'list',
          message: `您指定的路径可能会花大量时间扫描文件系统, 确定继续 ? ${colors.yellow(_path)}`,
          name: 'dangerScan',
          choices: [
            YesOrNoEnum.no,
            YesOrNoEnum.yes,
          ],
          default: YesOrNoEnum.no,
        },
      ]
    )
  },
  async showScanPackTable(opt: ScanTableOptions) {
    lastTableOptions = opt
    if (!onResize['onResize']) {
      process.stdout.on('resize', onResize)
      onResize['onResize'] = true
    }
    await sleep(50)
    clearScreen()
    const part = process.stdout.columns / 10
    const result = await inquirer['prompt'](
      [
        {
          type: "table",
          name: "packInfo",
          message: "",
          pageSize: 6,
          showIndex: true,
          tableOptions: {
            // wordWrap: true,
            wrapOnWordBoundary: true,
            colWidths: [part / 2, part * 2, part * 2, part * 5.3].map(n => Math.floor(n))
          },
          columns: opt.columns || [],
          rows: opt.rows || []
        }
      ]
    )
    onResize['onResize'] = false
    process.stdout.off('resize', onResize)
    return result
  },
  async questionInputPath() {
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
      ]
    )
  },
  async questionOutputPath() {
    return inquirer['prompt'](
      [
        {
          type: 'input',
          message: `输出目录, 默认为当前所在目录的( ${colors.yellow(PUBLIC_OUTPUT_PATH)} ): `,
          name: 'outputPath',
        },
      ]
    )
  },
  async isClearOldCache(cachePath = '') {
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
  async showFileExplorer() {
    return inquirer['prompt'](
      [
        {
          type: 'list',
          message: `\n 将打开文件管理器, 确定继续 ?`,
          name: 'showFileExplorer',
          choices: [
            YesOrNoEnum.no,
            YesOrNoEnum.yes,
          ],
          default: YesOrNoEnum.no,
        },
      ]
    )
  },
}
export default prompts
