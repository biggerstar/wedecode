import {ScanPackagesResultInfo} from "@/typings/index";
import {OperationModeEnum, StreamPathDefaultEnum} from "@/bin/wedecode/enum";
import {startSacnPackagesProcess} from "@/bin/wedecode/scan";
import {checkExistsWithFilePath, startCacheQuestionProcess} from "@/bin/wedecode/common";
import colors from "picocolors";
import DecompilationController from "@/decompilation-controller";
import {sleep} from "@/utils/common";
import prompts from "@/bin/wedecode/inquirer";
import path from "node:path";
import openFileExplorer from "open-file-explorer";

/**
 * 通过命令行交互获取输入和输出路径
 * */
async function setInputAndOutputPath(config: Record<any, any>, opt: {
  hasInputPath: boolean,
  hasOutputPath: boolean
}): Promise<void> {
  const {hasInputPath = false, hasOutputPath = false} = opt || {}
  let packInfo: Partial<ScanPackagesResultInfo>
  if (!hasInputPath) {
    const {selectMode} = await prompts.selectMode()
    if (selectMode === OperationModeEnum.autoScan) {
      packInfo = await startSacnPackagesProcess()
      config.inputPath = packInfo.storagePath
    } else if (selectMode === OperationModeEnum.manualScan) {
      const {manualScanPath} = await prompts.inputManualScanPath()
      packInfo = await startSacnPackagesProcess(manualScanPath)
      config.inputPath = packInfo.storagePath
    } else {
      const {inputPath} = await prompts.questionInputPath()
      config.inputPath = inputPath || config.inputPath
    }
  }
  if (!hasOutputPath) {
    let outputSubName: string = StreamPathDefaultEnum.defaultOutputPath
    if (packInfo) { // 没手动指定路径并且发现路径中的 appId 存在，则自动指定输出到名为 appName 或 appId 的目录
      outputSubName = packInfo.appName || packInfo.appId
    } else {
      const {outputPath} = await prompts.questionOutputPath()
      outputSubName = outputPath || outputSubName
    }
    config.outputPath = path.resolve((packInfo?.storagePath || './'), StreamPathDefaultEnum.publicOutputPath, outputSubName)
  }
}

/**
 * 执行主命令行程序流程
 * */
export async function startMainCommanderProcess(args: string[], argMap: Record<string, any>): Promise<boolean> {
  const hasInputPath = !!args[0]
  const hasOutputPath = !!argMap.out
  const isClear = argMap.clear
  const config = {
    inputPath: args[0] || StreamPathDefaultEnum.inputPath,
    outputPath: argMap.out || StreamPathDefaultEnum.defaultOutputPath
  }
  await setInputAndOutputPath(config, {hasInputPath, hasOutputPath})
  if (!checkExistsWithFilePath(config.inputPath, {throw: true})) return false
  // 经过上面转换， 文件输出位置最终都会在该小程序包同级目录下的 OUTPUT 文件夹中输出
  await startCacheQuestionProcess(isClear, config.inputPath, config.outputPath)
  const decompilationController = new DecompilationController(config.inputPath, config.outputPath)
  decompilationController.setState({
    usePx: argMap.px || false,
    unpackOnly: argMap.unpackOnly || false,
    wxid: argMap.wxid || null,
  })
  await decompilationController.startDecompilerProcess()
  if (argMap.openDir) {
    console.log('\n \u25B6 打开文件管理器: ', colors.yellow(path.resolve(config.outputPath)))
    openFileExplorer(config.outputPath, () => void 0)
  }else {
    console.log('\n \u25B6 输出路径: ', colors.yellow(path.resolve(config.outputPath)))
  }
  await sleep(500)
  return true
}
