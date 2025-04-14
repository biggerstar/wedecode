import fs from "node:fs";
import path from "node:path";
import type { RmOptions } from "fs";
import { pluginDirRename } from "@/constant";

/**
 * 读取文件，没有文件或者文件为空返回空字符串
 * */
export function readLocalFile(path: string, encoding: BufferEncoding = 'utf-8'): string {
  return fs.existsSync(path) ? fs.readFileSync(path, encoding) : ''
}

/**
 * 读取文件，没有文件或者文件为空返回 null
 * */
export function readLocalJsonFile<T extends Record<any, any>>(path: string, encoding: BufferEncoding = 'utf-8'): T | null {
  try {
    return JSON.parse(readLocalFile(path, encoding))
  } catch (e) {
    return null
  }
}

/**
 * 顺序读取列表中的文件， 直到读取的文件包含内容
 * */
export function readFileUntilContainContent(pathList: string[], encoding: BufferEncoding = 'utf-8'): {
  data: string,
  found: boolean,
  path: string
} {
  for (const filePath of pathList) {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, encoding)
      if (data.length) {
        return {
          found: true,
          data,
          path: filePath
        }
      }
    }
  }
  return {
    found: false,
    data: '',
    path: ''
  }
}

/**
 * @param {string} filepath
 * @param {any} data
 * @param {Object} opt
 * @param {boolean} opt.force 是否强制覆盖, 默认为 false
 * @param {boolean} opt.emptyInstead 如果文原始件为空则允许覆盖
 * */
export function saveLocalFile(
  filepath: string,
  data: string | NodeJS.ArrayBufferView | Buffer,
  opt: { force?: boolean, emptyInstead?: boolean } = {}
): boolean {
  filepath = filepath.replace(pluginDirRename[0], pluginDirRename[1]) // 重定向插件路径
  const targetData = fs.existsSync(filepath) ? fs.readFileSync(filepath, { encoding: 'utf-8' }).trim() : ''
  let force = typeof opt.force === 'boolean' ? opt.force : opt.emptyInstead || !targetData.length
  const outputDirPath = path.dirname(filepath)
  const isExistsFile = fs.existsSync(filepath)
  const isExistsPath = fs.existsSync(outputDirPath)
  if (isExistsFile && !force) return false
  if (!isExistsPath) {
    fs.mkdirSync(outputDirPath, { recursive: true })
  }
  fs.writeFileSync(filepath, data as any)
  return true
}

export function deleteLocalFile(path: string, opt: RmOptions & { catch?: boolean } = {}): void {
  try {
    fs.rmSync(path, opt)
  } catch (e) {
    if (!opt.catch) throw e
  }
}
