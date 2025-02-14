#!/bin/bash

set -e  # 遇到错误立即退出

# 检查当前系统是否为 macOS
if [[ "$(uname)" == "Darwin" ]]; then
    echo "Running on macOS..."

    # 清理之前的构建
    rm -f node_modules/ffmpeg-static/ffmpeg-*

    echo "Building x64 version..."
    ARCH=x64 npm rebuild ffmpeg-static --force
    if [ ! -f node_modules/ffmpeg-static/ffmpeg ]; then
        echo "Error: x64 build failed - ffmpeg binary not found"
        exit 1
    fi
    mv node_modules/ffmpeg-static/ffmpeg node_modules/ffmpeg-static/ffmpeg-x64

    echo "Building arm64 version..."
    ARCH=arm64 npm rebuild ffmpeg-static --force
    if [ ! -f node_modules/ffmpeg-static/ffmpeg ]; then
        echo "Error: arm64 build failed - ffmpeg binary not found"
        exit 1
    fi
    mv node_modules/ffmpeg-static/ffmpeg node_modules/ffmpeg-static/ffmpeg-arm64

    # 验证架构
    echo "Verifying architectures..."
    x64_arch=$(file node_modules/ffmpeg-static/ffmpeg-x64 | grep -o 'x86_64\|arm64')
    arm64_arch=$(file node_modules/ffmpeg-static/ffmpeg-arm64 | grep -o 'x86_64\|arm64')

    if [ "$x64_arch" != "x86_64" ]; then
        echo "Error: x64 binary is not x86_64 architecture"
        exit 1
    fi

    if [ "$arm64_arch" != "arm64" ]; then
        echo "Error: arm64 binary is not arm64 architecture"
        exit 1
    fi

    echo "Creating universal binary..."
    cd node_modules/ffmpeg-static
    lipo -create ffmpeg-arm64 ffmpeg-x64 -output ffmpeg

    # 验证最终的通用二进制文件
    if [ ! -f ffmpeg ]; then
        echo "Error: Failed to create universal binary"
        exit 1
    fi

    echo "Verifying universal binary..."
    universal_archs=$(lipo -info ffmpeg | grep -o 'x86_64\|arm64')
    if [[ ! $universal_archs =~ "x86_64" ]] || [[ ! $universal_archs =~ "arm64" ]]; then
        echo "Error: Universal binary does not contain both architectures"
        exit 1
    fi

    echo "Successfully created universal binary"
else
    echo "Not running on macOS, skipping universal binary creation"
fi

# 继续执行 electron-builder install-app-deps
electron-builder install-app-deps
