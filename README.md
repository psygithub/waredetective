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
- npm 或 yarn
- Docker（可选）

### 本地安装

1. 克隆项目
```bash
git clone <repository-url>
cd WarehouseDetective
```

2. 安装依赖
```bash
npm install
```

3. 安装浏览器
```bash
npm run install-browsers
```

4. 启动服务器
```bash
npm run server
```

5. 访问应用
- 主页: http://localhost:3000
- 管理后台: http://localhost:3000/admin
- 登录页: http://localhost:3000/login

### Docker 部署

1. 构建镜像
```bash
npm run docker:build
```

2. 运行容器
```bash
npm run docker:run
```

或使用 Docker Compose：

```bash
npm run docker:compose
```

## 默认账户

系统会自动创建默认超级管理员账户：

- **用户名**: admin
- **密码**: admin123

## 项目结构

```
WarehouseDetective/
├── src/                    # 源代码
│   ├── main.js            # 原始库存检测逻辑
│   ├── app.js             # 应用入口
│   ├── server.js          # Web 服务器
│   ├── database.js        # 数据库操作
│   └── auth.js            # 认证服务
├── public/                # 前端文件
│   ├── index.html         # 主页
│   ├── login.html         # 登录页
│   ├── admin.html         # 管理后台
│   └── admin.js           # 管理后台脚本
├── config/                # 配置文件
│   └── config.json        # 主配置
├── data/                  # 数据库文件
├── output/                # 输出结果
├── tests/                 # 测试文件
├── Dockerfile             # Docker 配置
├── docker-compose.yml     # Docker Compose 配置
└── package.json           # 项目配置
```

## API 接口

### 认证接口

- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/auth/verify` - 验证令牌

### 用户管理

- `GET /api/users` - 获取用户列表（超级管理员）
- `GET /api/users/:id` - 获取用户信息
- `PUT /api/users/:id` - 更新用户信息
- `DELETE /api/users/:id` - 删除用户（超级管理员）

### 配置管理

- `GET /api/configs` - 获取配置列表
- `POST /api/configs` - 创建配置
- `GET /api/configs/:id` - 获取配置详情
- `PUT /api/configs/:id` - 更新配置
- `DELETE /api/configs/:id` - 删除配置

### 任务执行

- `POST /api/tasks/run` - 立即执行任务
- `GET /api/tasks/status` - 获取任务状态

### 结果查看

- `GET /api/results` - 获取结果列表
- `GET /api/results/:id` - 获取结果详情

### 定时任务

- `GET /api/schedules` - 获取定时任务列表
- `POST /api/schedules` - 创建定时任务
- `PUT /api/schedules/:id` - 更新定时任务
- `DELETE /api/schedules/:id` - 删除定时任务

## 配置说明

### 环境变量

- `PORT` - 服务器端口（默认：3000）
- `NODE_ENV` - 运行环境（development/production）
- `JWT_SECRET` - JWT 密钥
- `SESSION_SECRET` - 会话密钥
- `CORS_ORIGIN` - CORS 允许的源

### 配置文件

`config/config.json` 包含网站登录信息和默认搜索配置：

```json
{
  "website": {
    "loginUrl": "https://example.com/",
    "username": "your-username",
    "password": "your-password"
  },
  "search": {
    "skus": ["SKU1", "SKU2"],
    "regions": ["地区1", "地区2"]
  },
  "output": {
    "format": "json",
    "filename": "warehouse_results.json"
  },
  "browser": {
    "headless": false,
    "timeout": 30000,
    "viewport": {
      "width": 1280,
      "height": 720
    }
  }
}
```

## 定时任务

系统支持使用 Cron 表达式设置定时任务：

- `0 0 * * *` - 每天午夜执行
- `0 */6 * * *` - 每6小时执行
- `0 0 * * 1` - 每周一午夜执行
- `0 0 1 * *` - 每月1号午夜执行

## 安全特性

- JWT 令牌认证
- 密码哈希存储
- 请求频率限制
- CORS 保护
- Helmet 安全头
- 基于角色的访问控制

## 开发

### 可用脚本

- `npm start` - 启动原始检测脚本
- `npm run server` - 启动 Web 服务器
- `npm run dev` - 开发模式启动
- `npm test` - 运行测试
- `npm run docker:build` - 构建 Docker 镜像
- `npm run docker:compose` - 使用 Docker Compose 启动

### 添加新功能

1. 在 `src/` 目录下添加新的模块
2. 在 `src/server.js` 中添加新的路由
3. 在前端页面中添加相应的界面
4. 更新 API 文档

## 故障排除

### 常见问题

1. **浏览器启动失败**
   - 确保已安装 Playwright 浏览器：`npm run install-browsers`
   - 检查系统是否支持 Chromium

2. **登录失败**
   - 检查 `config/config.json` 中的登录凭据
   - 确认目标网站可访问

3. **端口占用**
   - 修改环境变量 `PORT` 或 `docker-compose.yml` 中的端口映射

4. **权限问题**
   - 确保应用有写入 `data/` 和 `output/` 目录的权限

### 日志查看

- 应用日志会输出到控制台
- Docker 容器日志：`docker logs <container-name>`
- Docker Compose 日志：`docker-compose logs`

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 更新日志

### v1.0.0
- 初始版本发布
- 基础库存检测功能
- Web 管理界面
- 用户认证系统
- 定时任务支持
- Docker 容器化
