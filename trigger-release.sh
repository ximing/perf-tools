#!/bin/bash

# 检查是否提供了版本号参数
if [ -z "$1" ]; then
    echo "请提供版本号参数，例如: ./trigger-release.sh 1.0.0"
    exit 1
fi

VERSION=$1

# 检查版本号格式是否正确
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "版本号格式错误，应该是 x.y.z 格式，例如: 1.0.0"
    exit 1
fi

# 检查是否有未提交的更改
if [ -n "$(git status --porcelain)" ]; then
    echo "有未提交的更改，请先提交或存储更改"
    exit 1
fi

# 更新 package.json 中的版本号
npm version $VERSION --no-git-tag-version

# 提交更改
git add package.json
git commit -m "chore: release v$VERSION"

# 创建标签
git tag "v$VERSION"

# 推送更改和标签
echo "正在推送更改和标签..."
git push origin master
git push origin "v$VERSION"

echo "✨ 发布流程已启动！"
echo "版本: v$VERSION"
echo "请检查 GitHub Actions 以查看构建进度"
