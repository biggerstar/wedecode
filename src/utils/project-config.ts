import path from 'node:path';
import { deepmerge } from '@biggerstar/deepmerge';
import { readLocalFile, saveLocalFile } from '@/utils/fs-process';
import { isDev } from '@/bin/wedecode/enum';

/**
 * 项目配置生成工具类
 * 负责生成小程序项目的配置文件
 */
export class ProjectConfigUtils {
  /**
   * 生成小程序的项目配置文件
   * @param outputPath 输出路径
   */
  static async generateProjectConfigFiles(outputPath: string): Promise<void> {
    const projectPrivateConfigJsonPath = path.join(outputPath, 'project.private.config.json');
    
    const DEV_defaultConfigData = {
      "setting": {
        "ignoreDevUnusedFiles": false,
        "ignoreUploadUnusedFiles": false,
      }
    };
    
    const defaultConfigData = {
      "setting": {
        "es6": false,
        "urlCheck": false,
      }
    };
    
    if (isDev) {
      Object.assign(defaultConfigData.setting, DEV_defaultConfigData.setting);
    }
    
    let finallyConfig = {};
    const projectPrivateConfigString = readLocalFile(projectPrivateConfigJsonPath);
    
    if (projectPrivateConfigString) {
      const projectPrivateConfigData = JSON.parse(projectPrivateConfigString);
      deepmerge(projectPrivateConfigData, defaultConfigData);
      finallyConfig = projectPrivateConfigData;
    } else {
      finallyConfig = defaultConfigData;
    }
    
    saveLocalFile(projectPrivateConfigJsonPath, JSON.stringify(finallyConfig, null, 2), { force: true });
  }
}