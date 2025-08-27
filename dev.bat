@echo off
set IMAGE_NAME=wareimg
set CONTAINER_NAME=ware
set HOST_PORT=3000

echo 启动仓库检测系统开发环境...

:: 检查镜像是否存在
docker image inspect %IMAGE_NAME% >nul 2>&1
if errorlevel 1 (
    echo 构建开发镜像...
    docker build -f debian_df -t %IMAGE_NAME% .
)

:: 停止并移除已有的容器
docker stop %CONTAINER_NAME% >nul 2>&1
docker rm %CONTAINER_NAME% >nul 2>&1

:: 启动开发容器
echo 启动开发服务器...
docker run -it --rm ^
  -p %HOST_PORT%:3000 ^
  -v %CD%:/app ^
  -v /app/node_modules ^
  --name %CONTAINER_NAME% ^
  %IMAGE_NAME%