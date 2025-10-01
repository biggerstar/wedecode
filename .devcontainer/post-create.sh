#!/bin/bash

echo "🚀 设置 Wedecode 工作环境..."

# 创建必要的工作目录
mkdir -p workspaces uploads output

# 快速安装依赖（后台运行，避免阻塞）
echo "📦 开始安装依赖（后台运行）..."
nohup pnpm install --prefer-offline --no-optional > install.log 2>&1 &

echo "✅ 环境设置完成！"
echo "💡 依赖正在后台安装，请稍等片刻"
echo "💡 安装完成后运行 'npm run ui' 启动开发服务器"