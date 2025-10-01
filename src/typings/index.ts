import {getPathResolveInfo} from "@/utils/common";

export type AppCodeInfo = {
  appConfigJson: string;
  appWxss: string;
  workers: string;
  pageFrame: string;
  pageFrameHtml: string;
  appService: string;
  appServiceApp: string;
}

export type GameCodeInfo = {
  workers: string;
  gameJs: string;
  appConfigJson: string;
  subContextJs: string;
}
export type WxmlRenderFunction = {
  f: Function,
  j: any[],
  i: any[],
  ti: any[],
  ic: any[]
}
export type ModuleDefine = {
  /**
   * 包含所有的 wxml 组件渲染函数
   * */
  entrys: Record<string, WxmlRenderFunction>
  /**
   * 包含当前已经载入的模块和 wxs 映射关系, 不一定是完整的, 跟随页面加载会变化
   * */
  modules: Record<string, Record<any, any> | Function>
  /**
   * 包含所有的 wxml 组件定义
   * */
  defines: Record<any, Record<any, any>>
}
export type UnPackInfo = {
  /**
   * wxapkg 包的类型，主包 或者 分包 或者 独立分包
   * */
  packType: MiniPackType;
  /**
   * 小程序的类型， 小程序或者小游戏
   * */
  appType: MiniAppType;
  /**
   * 当前分包相对于主包根的路径
   * */
  subPackRootPath: string;
  /**
   * 永远指向分包的路径解析
   * */
  pathInfo: PathResolveInfo;
  /**
   * 永远指向主包的路径解析
   * */
  outputPathInfo: PathResolveInfo;
  /**
   * 后缀为 .wxapkg 的包路径
   * */
  inputPath: string;
  /**
   * 输出的文件夹路径
   * */
  outputPath: string;
}

export type ExecuteAllGwxFunction =   {
  COMPONENTS: ModuleDefine;
  PLUGINS: Record<string, ModuleDefine>;
  ALL_ENTRYS: ModuleDefine["entrys"];
  ALL_MODULES: ModuleDefine["modules"];
  ALL_DEFINES: ModuleDefine["defines"];
}

export type PloyfillItem = {
  fullPath: string,
  ployfillPath: string
}

export type PathResolveInfo = ReturnType<typeof getPathResolveInfo>

export type MiniPackType = 'main' | 'sub' | 'independent'     // 主包 | 分包 | 独立分包
export type MiniAppType = 'app' | 'game'

export enum PackTypeMapping {
  main = '主包',
  sub = '分包',
  independent = '独立分包',   // 还是分包， 只是不依赖主包模块
}

export enum AppTypeMapping {
  app = '小程序',
  game = '小游戏',
}

export type SacnPackagesPathItem = {
  isAppId: boolean;
  appId: string;
  path: string;
  storagePath: string;
}

export type PackageInfoResult = {
  nickname: string,
  username: string,
  description: string,
  avatar: string,
  uses_count: string
  principal_name: string
  appid: string
}

export type ScanPackagesResultInfo = {
  /**
   * 小程序名称
   * */
  appName: string,
  /**
   * 小程序描述
   * */
  description: string,
  /**
   * 小程序的 APPID
   * */
  appId: string,
  /**
   * 小程序的名称路径根
   * */
  path: string
  /**
   * 真实的小程序存放路径
   * */
  storagePath: string
}

export type WxsRefInfo = Array<{
  wxsRender: Function, // wxs 渲染函数
  moduleName: boolean,
  inlineModuleName?: string,
  isInline: boolean
  wxsPath: string
  wxmlPath: string,
  templateList: string[]
}>

export type DecompilationControllerState = {
  /** 使用 px 单位解析 wxss */
  usePx: boolean,
  /** 仅解包 */
  unpackOnly: boolean,
  /** 微信小程序 WXID */
  wxid?: string | null,
}
export type ScanTableOptions =  { columns: any[]; rows: any[] }
