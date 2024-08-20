import {glob} from "glob";
import {isWxAppid} from "@/utils/common";

const globPathList: string[] = [
  // macGlob
  '/Users/*/Library/Containers/*/Data/.wxapplet/packages/*',
  // winGlob
  'C:\\Users\\*\\Documents\\WeChat Files\\Applet\\',
  // linuxGlob
  '/home/*/.config/WeChat/Applet/'
]

/**
 * 扫描小程序包
 * */
function sacnPackages(): string[] {
  const foundPackageList = []
  globPathList.forEach(globPath => {
    try {
      const matchList = glob.globSync(globPath)
      matchList.forEach(path => {
        const appId = path.split('/').pop()
        if (isWxAppid(appId)) {
          foundPackageList.push(path)
        }
      })
    } catch (e) {
    }
  })
  return foundPackageList
}

/**
 * 开始进行扫描小程序包流程
 * */
export async function startSacnPackagesProcess() {
  const foundPackageList = sacnPackages()
}
