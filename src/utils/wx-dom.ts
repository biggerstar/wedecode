const proxyableSymbol = Symbol("proxyable");

const systemInfo = {
  windowWidth: 375,
  windowHeight: 600,
  pixelRatio: 2,
  language: "en",
  version: "1.9.90",
  platform: "ios",
};

/**
 * 目的是为了在 dom 上获取到未知属性的时候不会因为报错中断程序，
 * 而是返回一个代理化对象，这个对象会继续代理化未知属性，直到找到一个已知的属性为止。
 * 优点: 能杜绝大部分小程序源码的运行错误问题
 * 缺点: 不易获得 WX 官方API最新特性更新
 * */
function makeProxiesAble(defaultValue: Record<symbol | string, any>) {
  const knownProps = Object.keys(defaultValue);
  defaultValue[proxyableSymbol] = true;
  return new Proxy(defaultValue, {
    get(target, prop) {
      const value = target[prop as keyof typeof target];
      if (typeof value === "function") {
        return value.bind(target);
      }
      if (
        value?.[proxyableSymbol] ||
        typeof value === "symbol" ||
        typeof prop === "symbol"
      ) {
        // 返回二级代理化对象
        return value;
      }
      if (!knownProps.includes(prop as string)) {
        console.log("获取到未知属性: 请反馈到 wedecode 项目中, 谢谢! ", prop);
      }
      return function () {
        return makeProxiesAble({});
      };
    },
    set(target, prop, value) {
      target[prop as keyof typeof target] = value;
      return true;
    },
  });
}

const WX_API = {
  request() {},
  getExtConfig() {},
  getExtConfigSync() {},
  postMessageToReferrerPage: function () {},
  postMessageToReferrerMiniProgram: function () {},
  onUnhandledRejection: function () {},
  onThemeChange: function () {},
  onPageNotFound: function () {},
  onLazyLoadError: function () {},
  onError: function () {},
  onAudioInterruptionEnd: function () {},
  onAudioInterruptionBegin: function () {},
  onAppShow: function () {},
  onAppHide: function () {},
  offUnhandledRejection: function () {},
  offThemeChange: function () {},
  offPageNotFound: function () {},
  offLazyLoadError: function () {},
  offError: function () {},
  offAudioInterruptionEnd: function () {},
  offAudioInterruptionBegin: function () {},
  offAppShow: function () {},
  offAppHide: function () {},
  getStorageSync: function () {},
  setStorageSync: function () {},
  getStorage: function () {},
  setStorage: function () {},
  getSystemInfo() {
    return systemInfo;
  },
  getSystemInfoSync() {
    return systemInfo;
  },
  getRealtimeLogManager() {
    return {
      log: (msg: string) => console.log(msg),
      err: (msg: string) => console.error(msg),
    };
  },
  getMenuButtonBoundingClientRect() {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: 0,
      height: 0,
    };
  },
};

export function createWxFakeDom() {
  return makeProxiesAble({
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    __wxConfig: {},
    App() {},
    Component() {},
    Page() {},
    getApp: () => ({}),
    require: () => void 0,
    module: {},
    exports: {},
    global: {},
    Behavior: function () {},
    getCurrentPages: () => [],
    requireMiniProgram: function () {},
    $gwx: () => void 0,
    WXWebAssembly: {},
    __wxCodeSpace__: {},
    wx: makeProxiesAble(WX_API),

    // 4.x support
    __appServiceSDK__: makeProxiesAble({
      loadSubpackage: () => void 0,
    }),
    __subContextEngine__: makeProxiesAble({
      injectEntryFile: () => void 0,
      loadJsFiles: () => void 0,
    }),
  });
}
