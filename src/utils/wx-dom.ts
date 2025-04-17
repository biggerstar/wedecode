const systemInfo = {
  windowWidth: 375,
  windowHeight: 600,
  pixelRatio: 2,
  language: "en",
  version: "1.9.90",
  platform: "ios"
};

export function createWxFakeDom() {
  return {
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    __wxConfig: {},
    App() {
    },
    Component() {
    },
    Page() {
    },
    getApp: () => ({}),
    require: () => void 0,
    module: {},
    exports: {},
    global: {},
    Behavior: function () {
    },
    getCurrentPages: () => [],
    requireMiniProgram: function () {
    },
    $gwx: () => void 0,
    WXWebAssembly: {},
    __wxCodeSpace__: {},
    wx: {
      request() { },
      getExtConfig() { },
      getExtConfigSync() { },
      postMessageToReferrerPage: function () { },
      postMessageToReferrerMiniProgram: function () { },
      onUnhandledRejection: function () { },
      onThemeChange: function () { },
      onPageNotFound: function () { },
      onLazyLoadError: function () { },
      onError: function () { },
      onAudioInterruptionEnd: function () { },
      onAudioInterruptionBegin: function () { },
      onAppShow: function () { },
      onAppHide: function () { },
      offUnhandledRejection: function () { },
      offThemeChange: function () { },
      offPageNotFound: function () { },
      offLazyLoadError: function () { },
      offError: function () { },
      offAudioInterruptionEnd: function () { },
      offAudioInterruptionBegin: function () { },
      offAppShow: function () { },
      offAppHide: function () { },
      getStorageSync: function () { },
      setStorageSync: function () { },
      getStorage: function () { },
      setStorage: function () { },
      getSystemInfo() {
        return systemInfo
      },
      getSystemInfoSync() {
        return systemInfo
      },
      getRealtimeLogManager() {
        return {
          log: (msg: string) => console.log(msg),
          err: (msg: string) => console.error(msg)
        }
      },
      getMenuButtonBoundingClientRect() {
        return {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: 0,
          height: 0
        }
      },
    },
  }
}
