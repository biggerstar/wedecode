import {PUBLIC_OUTPUT_PATH} from "@/constant";
/**
 * 主包文件名特征
 * */
export const AppMainPackageNames: string[] = ['__APP__.wxapkg', 'app.wxapkg']

export enum CacheClearEnum {
  clear = '清空',
  notClear = '不清空',
}

export enum OperationModeEnum {
  autoScan = '自动扫描小程序包 ( 联网可显示小程序信息 )',
  manualScan = '手动设定扫描目录',
}

export enum StreamPathDefaultEnum {
  inputPath = './',
  publicOutputPath = PUBLIC_OUTPUT_PATH,
  defaultOutputPath = 'default',
}

export enum YesOrNoEnum {
  yes = '是',
  no = '否',
}
