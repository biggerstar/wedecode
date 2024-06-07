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


微信小程序反编译工具,  支持 `小程序` 和 `小游戏`

### 准备

该工具只能在有 `nodejs` 环境设备上运行， 如果您还没有 `nodejs` 环境，点这里 [去准备环境](https://nodejs.org/)

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
  wedecode ./dir
# 或者:  指定所有子包和主包输出到指定目录 --out 为输出目录
  wedecode ./dir  --out ./all_child_file_out
```

使用源码运行

```shell
  git clone https://github.com/biggerstar/wedecode
  npm i  # 如果 npm 安装很慢， 可以使用右侧命令换国内的淘宝源  npm config set registry https://registry.npmmirror.com
  npm run start
```

### 命令参数

| 参数                | 作用                                  |
|-------------------|-------------------------------------|
| `<packages...>`   | 包所在路径，可以是文件或者目录                     |
| `-o, --out`       | 产物及输出路径， 未指定默认放到同级目录下的 \_\_OUTPUT__ |
| `-ow --overwrite` | 是否直接覆盖旧产物                           |

### polyfill
在编译过程中， 在包所在文件夹在创建一个 polyfill 目录，如果发现里面的模块和输出到产物中的模块路径名称一致， 将会使用自定义的js模块，忽略原本js模块的编译  


```
小程序包所在位置目录结构
  
├── target_dir  
│   ├── xxx.wxapkg    
│   ├── xxx-sub.wxapkg    
│   └── polyfill/  
│       └── @babel/    
│           └── array.js    

```
```
输出产物目录结构   

├── OUTPUT  
│   ├─ app.json  
│   ├─ pages/  
│   ├─ components/  
│   ├─ @babel/  
│      └── array.js
```

### QA
1. Q: 为何编译出来好多文件只有默认模板?  
   A: 这可能是缺失分包，你需要把分包放在一起编译， 你可以在 app.config.json 或者 app.json 文件中查看你依赖的分包信息,    
      在编译产物中出现默认模板是因为小程序会检查依赖，为了保证在缺失部分分包的情况下正常运行而生成的默认模板  


 
### 免责声明

该工具仅限用于 线上代码安全审计以便快速发现漏洞 以及 手残党误删源代码丢失后还原项目减少损失,  
严禁任何非法用途。  
若你使用的范围不在允许范围内，造成的一切法律后果与作者无关。  
