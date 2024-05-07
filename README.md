<h1 align="center">Wedecode</h1>
<br/>
<p align="center">
    <a href="https://npmjs.com/package/wedecode">
        <img src="https://img.shields.io/npm/v/wedecode.svg" alt="npm package">
    </a>
    <a href="https://img.shields.io/npm/l/wedecode">
      <img src="https://img.shields.io/npm/l/wedecode?" alt="license"/>
    </a>
   <img src="https://img.shields.io/badge/%E5%BE%AE%E4%BF%A1%E7%89%88%E6%9C%AC-%3E=20180111-brightgreen.svg" alt="license"/>

</p>
<br/>


微信小程序反编译工具

### 准备

该工具只能在有 `nodejs` 环境设备上运行， 如果您还没有 nodejs 环境，点这里 [去准备环境](https://nodejs.org/)

### 安装工具

全局安装， 安装完成后在任意终端都可使用
```shell
# window
  npm i wedecode -g
# mac
  sudo npm i wedecode -g
```

### 运行

命令行直接输入 wedecode 即可运行, 全程自动引导

```shell
  wedecode
```

命令行直接指定

```shell
# 手动指定一个包
  wedecode ./xxx.wxapkg
# 或者   直接编译整个文件夹里面的主包和子包
  wedecode ./xxx/dir
# 或者:  指定所有子包和主包输出到指定目录 --out 为输出目录
  wedecode ./xxx/dir  --out ./all_child_file_out
```

使用源码运行

```shell
  git clone https://github.com/biggerstar/wedecode
  npm i pnpm
  npm run link
  wedecode
```


### 须知

该工具用于手残党误删源代码丢失后还原项目减少损失， 严禁用于非法用途。
