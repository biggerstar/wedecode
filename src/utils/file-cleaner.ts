import fs from 'node:fs';
import path from 'node:path';
import colors from 'picocolors';
import { glob } from 'glob';
import { deleteLocalFile, readLocalFile } from '@/utils/fs-process';
import { printLog, sleep } from '@/utils/common';
import { removeAppFileList, removeGameFileList } from '@/constant';

/**
 * 文件清理工具类
 * 负责清理反编译过程中产生的中间文件和缓存
 */
export class FileCleanerUtils {
  /**
   * 移除反编译过程中产生的缓存文件
   * @param outputPath 输出路径
   */
  static async removeCache(outputPath: string): Promise<void> {
    await sleep(500);
    let cont = 0;
    const removeFileList = removeGameFileList.concat(removeAppFileList);
    const allFile = glob.globSync(`${outputPath}/**/**{.js,.html,.json}`);
    
    allFile.forEach(filepath => {
      const fileName = path.basename(filepath).trim();
      const extname = path.extname(filepath);
      if (!fs.existsSync(filepath)) return;
      
      let _deleteLocalFile = () => {
        cont++;
        deleteLocalFile(filepath, { catch: true, force: true });
      };
      
      if (removeFileList.includes(fileName)) {
        _deleteLocalFile();
      } else if (extname === '.html') {
        const feature = 'var __setCssStartTime__ = Date.now()';
        const data = readLocalFile(filepath);
        if (data.includes(feature)) _deleteLocalFile();
      } else if (filepath.endsWith('.appservice.js')) {
        _deleteLocalFile();
      } else if (filepath.endsWith('.webview.js')) {
        _deleteLocalFile();
      }
    });

    if (cont) {
      printLog(`\n ▶ 移除中间缓存产物成功, 总计 ${colors.yellow(cont)} 个`, { isStart: true });
    }
  }

  /**
   * 清理指定类型的文件
   * @param outputPath 输出路径
   * @param filePatterns 文件匹配模式数组
   * @param description 清理描述
   */
  static async cleanFilesByPattern(
    outputPath: string, 
    filePatterns: string[], 
    description: string = '文件'
  ): Promise<number> {
    let count = 0;
    
    for (const pattern of filePatterns) {
      const files = glob.globSync(path.join(outputPath, pattern));
      files.forEach(filepath => {
        if (fs.existsSync(filepath)) {
          deleteLocalFile(filepath, { catch: true, force: true });
          count++;
        }
      });
    }
    
    if (count > 0) {
      printLog(`\n ▶ 清理${description}成功, 总计 ${colors.yellow(count)} 个`, { isStart: true });
    }
    
    return count;
  }

  /**
   * 清理空目录
   * @param outputPath 输出路径
   */
  static async cleanEmptyDirectories(outputPath: string): Promise<number> {
    let count = 0;
    
    const cleanEmptyDir = (dirPath: string): boolean => {
      if (!fs.existsSync(dirPath)) return false;
      
      const files = fs.readdirSync(dirPath);
      let isEmpty = true;
      
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          if (!cleanEmptyDir(fullPath)) {
            isEmpty = false;
          }
        } else {
          isEmpty = false;
        }
      }
      
      if (isEmpty && dirPath !== outputPath) {
        try {
          fs.rmdirSync(dirPath);
          count++;
          return true;
        } catch (error) {
          console.warn(`删除空目录失败: ${dirPath}`, error.message);
          return false;
        }
      }
      
      return false;
    };
    
    cleanEmptyDir(outputPath);
    
    if (count > 0) {
      printLog(`\n ▶ 清理空目录成功, 总计 ${colors.yellow(count)} 个`, { isStart: true });
    }
    
    return count;
  }
}