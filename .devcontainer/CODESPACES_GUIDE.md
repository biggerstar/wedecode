# 🚀 Wedecode GitHub Codespaces 使用指南

## 🎯 快速开始

1. **等待初始化** - Codespace 启动后会自动安装依赖并构建项目（约 2-3 分钟）
2. **访问界面** - 初始化完成后会自动启动 UI，在"端口"面板找到端口 3000 并打开
3. **开始使用** - 上传 `.wxapkg` 文件进行反编译

## 📁 目录说明

```
/workspace/
├── workspaces/     # 反编译项目存放目录
├── uploads/        # 文件上传目录  
└── output/         # 反编译结果输出目录
```

## 💡 常用命令

```bash
# 启动 UI 界面（已自动启动）
pnpm run ui

# 命令行反编译
pnpm run start

# 重新构建项目
pnpm run build
```

## 🔧 端口说明

- **3000** - Web UI 界面（主要使用）
- **8080** - API 服务端口

## 🚨 常见问题

**Q: 服务没有启动？**
A: 在终端运行 `pnpm run ui` 重新启动

**Q: 依赖安装失败？**
A: 运行 `pnpm install` 重新安装依赖

---

🎉 **开始使用吧！** 遇到问题可查看项目 README.md 或提交 GitHub Issues。
