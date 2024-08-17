export type CodeInfo = {
  appConfigJson: string,
  appWxss: string,
  workers: string,
  pageFrame: string,
  pageFrameHtml: string,
  appService: string,
  appServiceApp: string,
  gameJs: string,
  gameJson: string,
}

export type ModuleDefine = {
  modules: Record<string, Record<any, any> | Function>
  defines: Record<any, Record<any, any>>
  entrys: Record<string, { f: Function, j: any[], i: any[], ti: any[], ic: any[] }>
}
