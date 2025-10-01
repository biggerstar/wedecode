#!/bin/bash

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    echo -e "${2}${1}${NC}"
}

print_message "🔄 启动 Wedecode Online Workspace 服务..." $CYAN

# 切换到工作目录
cd /workspaces/wedecode

# 确保工作区目录存在
print_message "📁 检查工作目录..." $YELLOW
mkdir -p workspaces
mkdir -p uploads
mkdir -p output

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
    print_message "📦 检测到缺少依赖，正在安装..." $YELLOW
    if command -v pnpm &> /dev/null; then
        pnpm install
    else
        npm install
    fi
    print_message "✅ 依赖安装完成" $GREEN
fi

# 检查项目是否已构建
if [ ! -d "dist" ]; then
    print_message "🔨 检测到项目未构建，正在构建..." $YELLOW
    if command -v pnpm &> /dev/null; then
        pnpm run build
    else
        npm run build
    fi
    print_message "✅ 项目构建完成" $GREEN
fi

sleep 5

# 自动启动 UI 界面
print_message "🚀 正在启动 Wedecode UI 界面..." $CYAN
if command -v pnpm &> /dev/null; then
    pnpm run ui &
else
    npm run ui &
fi

print_message "" $NC