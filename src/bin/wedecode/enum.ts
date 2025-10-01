import { PUBLIC_OUTPUT_PATH } from '@/constant/index';
import process from 'node:process';
import os from 'node:os';

const macGlob: string[] = [
  // 版本3+
  '/Users/*/Library/Containers/*/Data/.wxapplet/packages',
  // 版本4.0+
  '/Users/*/Library/Containers/*/Data/Documents/app_data/radium/Applet/packages',
];

const winGlob: string[] = [
  // 版本3+
  'C:/Users/*/weixin/WeChat Files',
  'C:/Users/*/Documents/WeChat Files/Applet',
  // 版本4.0+
  'C:/Users/*/Documents/xwechat_files',
  'C:/Users/*/AppData/Roaming/*/xwechat/radium/Applet/packages',
  // 安装到其他盘
  'D:/WeChat Files/Applet',
  'E:/WeChat Files/Applet',
  'F:/WeChat Files/Applet',
];

const linuxGlob: string[] = [
  '/home/*/.config/WeChat/Applet',
];

/* ---------- 根据平台导出 ---------- */
function getPlatformGlob(): string[] {
  const platform = os.platform();
  switch (platform) {
    case 'win32':
      return winGlob;
    case 'darwin':
      return macGlob;
    case 'linux':
      return linuxGlob;
    default:
      return [];
  }
}

export const globPathList: string[] = getPlatformGlob();

export const AppMainPackageNames: string[] = ['__APP__.wxapkg', 'app.wxapkg'];

export enum CacheClearEnum {
  clear = '清空',
  notClear = '不清空',
}

export enum OperationModeEnum {
  autoScan = '\u25B6 自动扫描小程序包',
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

export const isDev = process.env.DEV === 'true';
