import { VM, VMOptions } from "vm2";
import { JSDOM } from "jsdom";
import { deepmerge } from "@biggerstar/deepmerge";
import { createWxFakeDom } from "@/utils/wx-dom";

export function createVM(vmOptions: VMOptions = {}) {
  const domBaseHtml = `<!DOCTYPE html><html lang="en"><head><title>''</title></head><body></body></html>`
  const dom = new JSDOM(domBaseHtml);
  const vm_window = dom.window
  const vm_navigator = dom.window.navigator
  const vm_document = dom.window.document
  const __wxAppCode__ = {}
  const fakeGlobal = {
    __wxAppCode__,
    publishDomainComponents: () => void 0,
  }
  Object.assign(vm_window, fakeGlobal)
  return new VM(deepmerge({
    sandbox: {
      ...createWxFakeDom(),
      setInterval: () => null,
      setTimeout: () => null,
      console: {
        ...console,  // 在 vm 执行的时候，对于小程序源码中的 info, log, warn 打印直接忽略
        log: ()=> void 0,
        warn: ()=> void 0,
        info: ()=> void 0,
      },
      window: vm_window,
      location: dom.window.location,
      navigator: vm_navigator,
      document: vm_document,
      define: () => void 0,
      require: () => void 0,
      requirePlugin: () => void 0,
      global: {
        __wcc_version__: 'v0.5vv_20211229_syb_scopedata',
      },
      System: {
        register: () => void 0,
      },
      __vd_version_info__: {},
      __wxAppCode__,
      __wxCodeSpace__: {
        setRuntimeGlobals: () => void 0,
        addComponentStaticConfig: () => void 0,
        setStyleScope: () => void 0,
        enableCodeChunk: () => void 0,
        initializeCodeChunk: () => void 0,
        addTemplateDependencies: () => void 0,
        batchAddCompiledScripts: () => void 0,
        batchAddCompiledTemplate: () => void 0,
      },
    }
  }, vmOptions));
}

export function runVmCode(vm: VM, code: string) {
  try {
    vm.run(code)
  } catch (e) {
    console.error(e.message)
  }
}
