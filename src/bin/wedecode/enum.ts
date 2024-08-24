import {PUBLIC_OUTPUT_PATH} from "@/constant";
import process from "node:process";

export const globPathList: string[] = [ // 末尾不要带 * 号
  // macGlob
  '/Users/*/Library/Containers/*/Data/.wxapplet/packages',
  'C:\\Users\\weixin\\WeChat Files\\',
  'D:\\Users\\weixin\\WeChat Files\\',
  // winGlob
  'C:\\Users\\*\\Documents\\WeChat Files\\Applet',
  // linuxGlob
  '/home/*/.config/WeChat/Applet'
]


/**
 * 主包文件名特征
 * */
export const AppMainPackageNames: string[] = ['__APP__.wxapkg', 'app.wxapkg']

export enum CacheClearEnum {
  clear = '清空',
  notClear = '不清空',
}

export enum OperationModeEnum {
  autoScan = '\u25B6 自动扫描小程序包 (Beta)',
  manualScan = '\u25B6 手动设定扫描目录',
  manualDir = '\u25B6 直接指定包路径( 非扫描 )',
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

export const isDev = process.env.DEV === 'true'
