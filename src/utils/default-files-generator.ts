import fs from 'node:fs';
import path from 'node:path';
import { isPluginPath, printLog, replaceExt } from '@/utils/common';
import { readLocalJsonFile, saveLocalFile } from '@/utils/fs-process';

/**
 * 默认文件生成工具类
 * 负责生成小程序项目的默认文件结构
 */
export class DefaultFilesGeneratorUtils {
  /**
   * 分析组件依赖关系
   * @param outputPath 输出路径
   * @param analysisList 需要分析的页面列表
   * @param deps 依赖数组
   * @returns 所有页面和组件的路径列表
   */
  static async analyzeComponentDependencies(
    outputPath: string,
    analysisList: string[], 
    deps: string[] = []
  ): Promise<string[]> {
    const allDeps = [...deps];
    
    for (const pagePath of analysisList) {
      if (allDeps.includes(pagePath)) continue;
      allDeps.push(pagePath);
      
      const pageJsonPath = path.join(outputPath, replaceExt(pagePath, '.json'));
      
      if (fs.existsSync(pageJsonPath)) {
        try {
          const pageConfig = readLocalJsonFile(pageJsonPath);
          const usingComponents = pageConfig?.usingComponents || {};
          const componentPaths = Object.values(usingComponents) as string[];
          
          if (componentPaths.length > 0) {
            const newDeps = await DefaultFilesGeneratorUtils.analyzeComponentDependencies(
              outputPath,
              componentPaths,
              allDeps
            );
            allDeps.push(...newDeps.filter(dep => !allDeps.includes(dep)));
          }
        } catch (error) {
          console.warn(`解析页面配置失败: ${pageJsonPath}`, error.message);
        }
      }
    }
    
    return allDeps;
  }

  /**
   * 生成组件构成必要的默认文件 (json, js, wxml)
   * @param outputPath 输出路径
   */
  static async generateDefaultAppFiles(outputPath: string): Promise<void> {
    const appConfigJson = readLocalJsonFile(path.join(outputPath, 'app-config.json'));
    const appConfigPages = (appConfigJson?.pages || [])
      .map(cPath => cPath.endsWith('/') ? cPath.substring(0, cPath.length - 1) : cPath);

    const allPage = await DefaultFilesGeneratorUtils.analyzeComponentDependencies(
      outputPath,
      appConfigPages
    );

    const allPageAndComp = allPage.filter(_path => !isPluginPath(_path));

    for (let pagePath of allPageAndComp) {
      // 生成 JSON 文件
      let jsonPath = path.join(outputPath, replaceExt(pagePath, ".json"));
      saveLocalFile(jsonPath, '{\n  "component":true\n}');
      
      // 生成 JS 文件
      let jsName = replaceExt(pagePath, ".js");
      let jsPath = path.join(outputPath, jsName);
      saveLocalFile(jsPath, "Page({ data: {} })");
      
      // 生成 WXML 文件
      let wxmlName = replaceExt(pagePath, ".wxml");
      let wxmlPath = path.join(outputPath, wxmlName);
      saveLocalFile(wxmlPath, `<text>${wxmlName}</text>`);
    }
    
    printLog(` ▶ 生成页面和组件构成必要的默认文件成功. \n`, { isStart: true });
  }

  /**
   * 生成单个页面的默认文件
   * @param outputPath 输出路径
   * @param pagePath 页面路径
   * @param options 生成选项
   */
  static generatePageFiles(
    outputPath: string,
    pagePath: string,
    options: {
      generateJson?: boolean;
      generateJs?: boolean;
      generateWxml?: boolean;
      generateWxss?: boolean;
      jsContent?: string;
      jsonContent?: string;
      wxmlContent?: string;
      wxssContent?: string;
    } = {}
  ): void {
    const {
      generateJson = true,
      generateJs = true,
      generateWxml = true,
      generateWxss = false,
      jsContent = "Page({ data: {} })",
      jsonContent = '{\n  "component":true\n}',
      wxmlContent = `<text>${pagePath}</text>`,
      wxssContent = `/* ${pagePath} styles */`
    } = options;

    if (generateJson) {
      const jsonPath = path.join(outputPath, replaceExt(pagePath, ".json"));
      saveLocalFile(jsonPath, jsonContent);
    }

    if (generateJs) {
      const jsPath = path.join(outputPath, replaceExt(pagePath, ".js"));
      saveLocalFile(jsPath, jsContent);
    }

    if (generateWxml) {
      const wxmlPath = path.join(outputPath, replaceExt(pagePath, ".wxml"));
      saveLocalFile(wxmlPath, wxmlContent);
    }

    if (generateWxss) {
      const wxssPath = path.join(outputPath, replaceExt(pagePath, ".wxss"));
      saveLocalFile(wxssPath, wxssContent);
    }
  }

  /**
   * 批量生成页面文件
   * @param outputPath 输出路径
   * @param pageList 页面列表
   * @param options 生成选项
   */
  static generateMultiplePageFiles(
    outputPath: string,
    pageList: string[],
    options?: Parameters<typeof DefaultFilesGeneratorUtils.generatePageFiles>[2]
  ): void {
    pageList.forEach(pagePath => {
      DefaultFilesGeneratorUtils.generatePageFiles(outputPath, pagePath, options);
    });
    
    printLog(` ▶ 批量生成 ${pageList.length} 个页面的默认文件成功`, { isStart: true });
  }
}