import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { PackageInfoResult } from '@/typings';
import { printLog } from '@/utils/common';
import { readLocalFile } from '@/utils/fs-process';

/**
 * 小程序信息工具类
 * 提供获取和更新小程序信息的功能
 */
export class WxAppInfoUtils {
  /**
   * 从远程API获取小程序信息
   * @param appid 小程序的appid
   * @returns 小程序信息或空对象
   */
  static async getWxAppInfo(appid: string): Promise<Partial<PackageInfoResult>> {
    try {
      printLog(`🔍 正在获取小程序信息: ${appid}`, { isEnd: true });
      const response = await axios.post('https://kainy.cn/api/weapp/info/', {
        appid: appid
      }, {
        timeout: 10000, // 10秒超时
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // API返回格式: {code: 0, data: {nickname: "...", appid: "..."}}
      if (response.data && response.data.code === 0 && response.data.data && response.data.data.nickname) {
        const appInfo = response.data.data;
        printLog(`✅ 成功获取小程序信息: ${appInfo.nickname}`, { isEnd: true });
        return appInfo;
      } else {
        printLog(`⚠️ 获取到的小程序信息为空或格式不正确`, { isEnd: true });
        return {};
      }
    } catch (error) {
      printLog(`❌ 获取小程序信息失败: ${error.message}`, { isEnd: true });
      if (error.response) {
        printLog(`📄 API错误响应: ${JSON.stringify(error.response.data)}`, { isEnd: true });
      }
      return {};
    }
  }

  /**
   * 更新工作区的小程序信息
   * @param workspaceId 工作区ID
   * @param appInfo 小程序信息
   * @param serverPort 服务器端口，默认3000
   */
  static async updateWorkspaceAppInfo(
    workspaceId: string, 
    appInfo: Partial<PackageInfoResult>,
    serverPort: number = 3000
  ): Promise<void> {
    try {
      console.log(`正在更新工作区 ${workspaceId} 的小程序信息`);
      const response = await axios.put(
        `http://localhost:${serverPort}/api/workspaces/${workspaceId}/appinfo`,
        { appInfo },  // 包装在对象中
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 200) {
        console.log('工作区小程序信息更新成功');
      } else {
        console.error('工作区小程序信息更新失败:', response.statusText);
      }
    } catch (error) {
      console.error('更新工作区小程序信息时发生错误:', error);
    }
  }

  /**
   * 获取并更新小程序信息的完整流程
   * @param workspaceId 工作区ID
   * @param appid 小程序appid
   * @param outputPath 输出路径，用于提取本地信息（已废弃，不再使用）
   * @param serverPort 服务器端口，默认3000
   */
  static async fetchAndUpdateAppInfo(
    workspaceId: string, 
    appid: string,
    outputPath?: string,
    serverPort: number = 3000
  ): Promise<void> {
    // 只从远程API获取信息
    const appInfo = await this.getWxAppInfo(appid);
    
    // 如果有任何信息，就更新工作区
    if (appInfo && Object.keys(appInfo).length > 0) {
      await this.updateWorkspaceAppInfo(workspaceId, appInfo, serverPort);
    }
  }

  /**
   * 从app.json文件中提取appid
   * @param appJsonPath app.json文件路径
   * @returns appid或null
   */
  static extractAppIdFromAppJson(appJsonPath: string): string | null {
    try {
      if (!fs.existsSync(appJsonPath)) {
        return null;
      }

      const appJsonContent = readLocalFile(appJsonPath);
      if (!appJsonContent) {
        return null;
      }

      const appJson = JSON.parse(appJsonContent);
      return appJson.appid || null;
    } catch (error) {
      console.warn('解析app.json失败:', error.message);
      return null;
    }
  }

  /**
   * 从app-config.json文件中提取appid
   * @param appConfigPath app-config.json文件路径
   * @returns appid或null
   */
  static extractAppIdFromConfig(appConfigPath: string): string | null {
    try {
      if (!fs.existsSync(appConfigPath)) {
        return null;
      }

      const appConfigContent = readLocalFile(appConfigPath);
      if (!appConfigContent) {
        return null;
      }

      const appConfig = JSON.parse(appConfigContent);
      return appConfig.appid || appConfig.extAppid || null;
    } catch (error) {
      console.warn('解析app-config.json失败:', error.message);
      return null;
    }
  }

  /**
   * 从多个来源提取小程序ID（只从app.json中提取）
   * @param outputPath 输出路径
   * @returns appid或null
   */
  static extractAppIdFromMultipleSources(outputPath: string): string | null {
    // 首先尝试从app.json中提取
    const appJsonPath = path.join(outputPath, 'app.json');
    let appId = this.extractAppIdFromAppJson(appJsonPath);
    
    if (appId) {
      printLog(`📱 从app.json中找到appid: ${appId}`, { isEnd: true });
      return appId;
    }

    return null;
  }

  /**
   * 尝试从反编译结果中获取并更新小程序信息
   * @param workspaceId 工作区ID
   * @param packInfo 反编译包信息
   * @param serverPort 服务器端口，默认3000
   * @param wxid 用户提供的微信小程序ID，优先使用
   */
  static async tryGetAndUpdateAppInfoFromPack(
    workspaceId: string,
    packInfo: any,
    serverPort: number = 3000,
    wxid?: string | null
  ): Promise<void> {
    if (!workspaceId) return;
    
    try {
      let appid: string | null = null;
      
      // 优先使用用户提供的wxid
      if (wxid && wxid.trim()) {
        appid = wxid.trim();
      } else {
        // 如果用户没有提供wxid，则从反编译结果中提取
        const outputPath = packInfo.pathInfo?.outputPath || packInfo.outputPath;
        appid = this.extractAppIdFromMultipleSources(outputPath);
        if (appid) {
          printLog(`🔍 从反编译文件中发现小程序ID: ${appid}，正在获取详细信息...`, { isEnd: true });
        }
      }
      
      if (appid) {
        await this.fetchAndUpdateAppInfo(workspaceId, appid, undefined, serverPort);
      } else {
        printLog(`⚠️ 未能找到小程序ID，跳过信息获取`, { isEnd: true });
      }
    } catch (error) {
      console.warn('获取小程序信息失败:', error.message);
    }
  }
}