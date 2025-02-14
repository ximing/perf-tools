#!/bin/bash

# 检查当前系统是否为 macOS
if [[ "$(uname)" == "Darwin" ]]; then
    # macOS 系统下执行以下操作
    npm rebuild --arch=x64 -f ffmpeg-static
    mv node_modules/ffmpeg-static/ffmpeg{,-x64}

    npm rebuild --arch=arm64 -f ffmpeg-static
    mv node_modules/ffmpeg-static/ffmpeg{,-arm64}

    cd node_modules/ffmpeg-static
    lipo -create ffmpeg-arm64 ffmpeg-x64 -output ffmpeg
else
    # 如果不是 macOS 系统，输出提示信息
    echo "This script is only intended to run on macOS."
fi
