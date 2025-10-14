# 仓库库存检测系统

一个基于 Node.js 和 Playwright 的智能仓库库存检测系统，支持定时任务、用户管理和 Web 界面。

## 功能特性

### 🔍 库存检测
- 自动化库存检测，支持多个 SKU 和地区
- 基于 Playwright 的网页自动化
- 实时结果展示和历史记录

### 👥 用户管理
- 用户注册和登录系统
- 基于角色的权限控制（普通用户、管理员、超级管理员）
- JWT 令牌认证

### ⚙️ 配置管理
- 灵活的 SKU 和地区配置
- 可重用的检测配置
- 配置的增删改查

### ⏰ 定时任务
- 基于 Cron 表达式的定时任务
- 自动执行库存检测
- 任务状态监控

### 📊 管理后台
- 直观的 Web 管理界面
- 实时数据统计
- 结果查看和分析

### 🐳 容器化部署
- Docker 支持
- Docker Compose 一键部署
- 生产环境优化

## 快速开始

### 环境要求

- Node.js 18+
- npm
- Docker（推荐）

### 本地安装

1.  **克隆项目**
    ```bash
    git clone https://github.com/psygithub/waredetective.git
    cd WarehouseDetective
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **安装 Playwright 浏览器**
    ```bash
    npm run install-browsers
    ```

4.  **启动服务器**
    ```bash
    npm run server
    ```

5.  **访问应用**
    - 主页: http://localhost:3000
    - 管理后台: http://localhost:3000/admin.html
    - 登录页: http://localhost:3000/login.html

### Docker 部署 (推荐)

使用 Docker 是最简单的部署方式，可以避免环境依赖问题。

1.  **构建并启动容器 (使用 Docker Compose)**
    ```bash
    docker-compose up -d
    ```
    该命令会根据 `docker-compose.yml` 自动构建镜像并在后台启动服务。

2.  **停止容器**
    ```bash
    docker-compose down
    ```

3.  **查看日志**
    ```bash
    docker-compose logs -f
    ```

#### 手动 Docker 命令

如果你想手动控制构建和运行过程：

1.  **构建镜像**
    ```bash
    docker build -t warehouse-detective .
    ```

2.  **运行容器**
    ```bash
    docker run -d -p 3000:3000 \
      -v $(pwd)/data:/app/data \
      -v $(pwd)/output:/app/output \
      -v $(pwd)/config:/app/config \
      --name warehouse-detective-container \
      warehouse-detective
    ```
    *该命令会将当前目录下的 `data`, `output`, `config` 文件夹挂载到容器中，以实现数据持久化。*
    windows:
    docker run -d -p 3000:3000 -v D:\Projects\WarehouseDetective\data:/app/data -v D:\Projects\WarehouseDetective\output:/app/output -v D:\Projects\WarehouseDetective\config:/app/config --name warehouse-detective-container warehousedetective-warehouse-detective
    *注意：为方便管理，仍然强烈建议使用 `docker-compose`。*

## 默认账户

系统会自动创建默认超级管理员账户：

-   **用户名**: admin
-   **密码**: admin123

## 项目结构

```
WarehouseDetective/
├── src/                    # 源代码
│   ├── app.js             # Express 应用入口
│   ├── server.js          # Web 服务器 (旧版，待整合)
│   ├── database.js        # 数据库操作 (LowDB)
│   ├── db_sqlite.js       # 数据库操作 (SQLite)
│   └── auth.js            # 认证服务
├── public/                # 前端静态文件
├── config/                # 配置文件
├── data/                  # 数据库文件 (持久化)
├── output/                # 输出结果 (持久化)
├── tests/                 # 测试文件
├── Dockerfile             # Docker 配置文件
├── docker-compose.yml     # Docker Compose 配置文件
└── package.json           # 项目依赖与脚本
```

## API 接口

### 认证接口

-   `POST /api/auth/login` - 用户登录
-   `POST /api/auth/register` - 用户注册
-   `GET /api/auth/verify` - 验证令牌

### 用户管理

-   `GET /api/users` - 获取用户列表（超级管理员）
-   `PUT /api/users/:id` - 更新用户信息
-   `DELETE /api/users/:id` - 删除用户（超级管理员）

### 配置管理

-   `GET /api/configs` - 获取配置列表
-   `POST /api/configs` - 创建配置
-   `PUT /api/configs/:id` - 更新配置
-   `DELETE /api/configs/:id` - 删除配置

### 任务执行

-   `POST /api/tasks/run` - 立即执行任务
-   `GET /api/tasks/status` - 获取任务状态

### 结果查看

-   `GET /api/results` - 获取结果列表
-   `GET /api/results/:id` - 获取结果详情

### 定时任务

-   `GET /api/schedules` - 获取定时任务列表
-   `POST /api/schedules` - 创建定时任务
-   `PUT /api/schedules/:id` - 更新定时任务
-   `DELETE /api/schedules/:id` - 删除定时任务

## 配置说明

### Docker 环境变量

在 `docker-compose.yml` 文件中，你可以修改 `environment` 部分来配置应用：

-   `NODE_ENV`: 运行环境 ( `production` 或 `development`)
-   `PORT`: 应用监听的端口 (默认为 `3000`)
-   `JWT_SECRET`: 用于生成 JWT 令牌的密钥，**请务必修改为强密钥**。
-   `SESSION_SECRET`: 用于会话管理的密钥，**请务必修改为强密钥**。

### 数据持久化

使用 Docker Compose 部署时，`data/`, `output/`, 和 `config/` 目录会自动映射到宿主机，确保容器重启或删除后数据不会丢失。

### 本地配置文件

`config/config.json` 包含网站登录信息和默认搜索配置，主要用于本地开发或旧版脚本。

## 安全特性

-   JWT 令牌认证
-   密码哈希存储 (bcryptjs)
-   请求频率限制 (express-rate-limit)
-   CORS 保护
-   Helmet 安全头
-   基于角色的访问控制

## 开发

### 可用脚本

-   `npm start`: 启动原始的 `main.js` 检测脚本。
-   `npm run server`: 启动 Express Web 服务器 (`app.js`)。
-   `npm run dev`: 在开发模式下启动服务器。
-   `npm test`: 运行基础测试。
-   `npm run playwright-test`: 使用 Playwright Test Runner 运行测试。
-   `npm run docker:build`: 构建 Docker 镜像。
-   `npm run docker:run`: 运行 Docker 容器。
-   `npm run docker:compose`: 使用 Docker Compose 启动服务。
-   `npm run docker:stop`: 使用 Docker Compose 停止服务。

## 故障排除

### 常见问题

1.  **浏览器启动失败**:
    -   本地运行时，请确保已安装 Playwright 浏览器: `npm run install-browsers`。
    -   Docker 环境下已包含所需依赖。

2.  **端口占用**:
    -   修改 `docker-compose.yml` 中的端口映射，例如将 `"3000:3000"` 改为 `"3001:3000"`。

3.  **权限问题**:
    -   确保 Docker 有权限读写 `./data`, `./output`, `./config` 目录。

### 日志查看

-   **Docker Compose**: `docker-compose logs -f`
-   **单个容器**: `docker logs <container_name>`

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT
