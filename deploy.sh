#!/bin/bash

# =============================================================================
# DevOps 自动化部署脚本
#
# 功能:
#   1. 从 Git 拉取最新代码。
#   2. 停止并删除旧的 Docker 容器。
#   3. 使用最新代码构建一个新的 Docker 镜像。
#   4. 启动一个新的容器来运行应用。
#   5. 清理构建过程中产生的无用镜像。
#
# 使用方法:
#   ./deploy.sh
#
# =============================================================================

# --- 在这里配置您的变量 ---
CONTAINER_NAME="warehouse-detective-container"
IMAGE_NAME="warehouse-detective"
# -------------------------

# set -e 的作用是：如果任何命令执行失败（返回非零退出码），
# 整个脚本会立即停止执行。这是一个非常重要的安全措施。
set -e

# --- 步骤 1: 从 Git 拉取最新代码 ---
echo "--- [步骤 1/5] 正在从 Git 拉取最新代码... ---"
git pull

# --- 步骤 2: 清理旧的容器 ---
echo "--- [步骤 2/5] 正在清理旧的容器 ($CONTAINER_NAME)... ---"
# 检查容器是否存在
if [ -n "$(docker ps -a -q -f name=^/${CONTAINER_NAME}$)" ]; then
    echo "发现旧容器，正在停止并删除..."
    # 使用 || true 来防止在容器不存在的情况下脚本因 set -e 而退出
    docker stop "$CONTAINER_NAME" || true
    docker rm "$CONTAINER_NAME" || true
    echo "旧容器清理完毕。"
else
    echo "未发现旧容器，无需清理。"
fi

# --- 步骤 3: 构建 Docker 镜像 ---
echo "--- [步骤 3/5] 正在构建新的 Docker 镜像 ($IMAGE_NAME)... ---"
docker build -t "$IMAGE_NAME" .

# --- 步骤 4: 运行新的 Docker 容器 ---
echo "--- [步骤 4/5] 正在启动新的容器 ($CONTAINER_NAME)... ---"
docker run -d \
  --network app-network \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /app/waredetective/data:/app/data \
  -v /app/waredetective/output:/app/output \
  -v /app/waredetective/config:/app/config \
  --name "$CONTAINER_NAME" \
  "$IMAGE_NAME"

# --- 步骤 5: 清理无用的镜像 ---
# docker image prune 会删除所有悬空（dangling）的镜像，即那些没有标签且未被任何容器使用的镜像。
# 这通常是构建新版本镜像后留下的旧镜像层。
echo "--- [步骤 5/5] 正在清理无用的 Docker 镜像... ---"
docker image prune -f

echo ""
echo "==============================================="
echo "  🚀 部署成功！"
echo "  容器 '$CONTAINER_NAME' 已成功启动。"
echo "==============================================="
