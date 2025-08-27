# Warehouse Detective 项目总结

## 项目概述

Warehouse Detective 是一个基于 Playwright 的自动化仓库库存检测工具，专门用于自动登录 westmonth.com 网站并搜索SKU库存信息。

## 项目结构

```
WarehouseDetective/
├── config/                     # 配置文件目录
│   ├── config.json             # 主配置文件（包含登录信息）
│   └── search-example.json     # 搜索配置示例
├── src/                        # 源代码目录
│   └── main.js                 # 主程序文件
├── test/                       # 测试文件目录
│   └── test-basic.js           # 基础功能测试
├── scripts/                    # 脚本工具目录
│   └── quick-start.js          # 快速启动工具
├── output/                     # 输出结果目录（自动创建）
│   └── warehouse_results.json  # 搜索结果文件
├── package.json                # 项目依赖配置
├── README.md                   # 项目说明文档
└── PROJECT_SUMMARY.md          # 项目总结（本文件）
```

## 核心功能

### 1. 自动登录
- 智能识别登录表单元素
- 支持多种用户名/密码输入框格式
- 自动处理登录流程

### 2. SKU搜索
- 批量搜索多个SKU
- 支持地区筛选
- 智能识别搜索框和结果

### 3. 数据提取
- 自动提取库存信息
- 支持多种页面布局
- 结构化数据输出

### 4. 结果保存
- JSON格式输出
- 包含时间戳和详细信息
- 支持自定义输出路径

## 配置说明

### 网站配置
```json
{
  "website": {
    "loginUrl": "https://westmonth.com/",
    "username": "18575215654",
    "password": "容易出025@"
  }
}
```

### 搜索配置
```json
{
  "search": {
    "skus": ["SKU001", "SKU002"],
    "regions": ["北京", "上海", "广州"]
  }
}
```

### 浏览器配置
```json
{
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

## 使用方法

### 1. 安装依赖
```bash
npm install
npm run install-browsers
```

### 2. 配置项目
编辑 `config/config.json` 文件，设置：
- 登录信息
- 要搜索的SKU列表
- 搜索地区（可选）

### 3. 运行程序

#### 方法一：使用配置文件
```bash
npm start
```

#### 方法二：命令行指定SKU
```bash
npm run quick SKU001 SKU002
```

#### 方法三：指定地区搜索
```bash
npm run quick --region 北京 SKU001
```

#### 方法四：无头模式运行
```bash
npm run quick --headless SKU001 SKU002
```

### 4. 查看结果
搜索结果保存在 `output/warehouse_results.json` 文件中。

## 可用命令

| 命令 | 说明 |
|------|------|
| `npm test` | 运行基础功能测试 |
| `npm start` | 使用配置文件启动程序 |
| `npm run quick` | 快速启动工具 |
| `npm run config` | 显示当前配置 |
| `npm run help` | 显示帮助信息 |
| `npm run install-browsers` | 安装Playwright浏览器 |

## 智能识别功能

### 登录元素识别
程序会自动尝试多种选择器来查找：
- 用户名输入框：`input[name="username"]`, `input[name="phone"]`, `input[type="text"]` 等
- 密码输入框：`input[name="password"]`, `input[type="password"]` 等
- 登录按钮：`button[type="submit"]`, `button:has-text("登录")` 等

### 搜索元素识别
- 搜索框：`input[name="search"]`, `input[name="sku"]`, `input[type="search"]` 等
- 结果容器：`.product-list`, `.search-results`, `table tbody tr` 等

## 输出格式

```json
{
  "timestamp": "2025-01-23T07:30:00.000Z",
  "totalResults": 2,
  "results": [
    {
      "sku": "SKU001",
      "region": "北京",
      "stock": "100",
      "link": "https://westmonth.com/search?sku=SKU001",
      "rawData": ["SKU001", "产品名称", "100", "北京仓库"]
    }
  ]
}
```

## 技术特性

### 1. 容错性强
- 多种选择器尝试
- 智能等待机制
- 异常处理完善

### 2. 可配置性高
- 灵活的配置文件
- 命令行参数支持
- 多种运行模式

### 3. 易于扩展
- 模块化设计
- 清晰的代码结构
- 详细的注释说明

### 4. 用户友好
- 彩色控制台输出
- 详细的进度提示
- 完善的帮助文档

## 故障排除

### 常见问题

1. **登录失败**
   - 检查用户名和密码
   - 确认网站可访问
   - 查看是否需要验证码

2. **搜索结果为空**
   - 检查SKU是否存在
   - 确认搜索框选择器
   - 查看控制台调试信息

3. **数据提取不准确**
   - 根据网站结构调整选择器
   - 修改 `extractSearchResults` 方法
   - 添加更多匹配规则

### 调试建议

1. 使用非无头模式观察浏览器操作
2. 查看控制台输出的调试信息
3. 检查网络连接和页面加载情况
4. 根据实际页面结构调整选择器

## 开发和定制

### 主要文件说明

1. **src/main.js** - 核心逻辑
   - `WarehouseDetective` 类
   - 登录、搜索、数据提取方法

2. **config/config.json** - 配置文件
   - 网站、搜索、浏览器、输出配置

3. **scripts/quick-start.js** - 快速启动工具
   - 命令行参数解析
   - 彩色输出和帮助信息

4. **test/test-basic.js** - 测试文件
   - 配置验证和基础功能测试

### 自定义开发

如需针对特定网站进行定制，主要修改：

1. **登录逻辑** - `login()` 方法
2. **搜索逻辑** - `searchSKU()` 方法
3. **数据提取** - `extractSearchResults()` 方法

每个方法都包含详细注释和多种选择器尝试，便于根据实际情况调整。

## 安全注意事项

1. **配置文件安全**
   - 不要将包含密码的配置文件提交到版本控制
   - 考虑使用环境变量存储敏感信息

2. **网络安全**
   - 确保在安全的网络环境中运行
   - 注意网站的使用条款和频率限制

3. **数据安全**
   - 妥善保管输出的库存数据
   - 定期清理不需要的历史数据

## 版本信息

- **版本**: 1.0.0
- **Node.js**: 建议 16.0.0 或更高版本
- **Playwright**: 1.40.0
- **支持平台**: Windows, macOS, Linux

## 许可证

MIT License - 详见项目根目录的 LICENSE 文件

## 联系和支持

如有问题或建议，请通过以下方式联系：
- 项目仓库：提交 Issue
- 文档：查看 README.md 获取更多信息
- 测试：运行 `npm test` 验证环境配置
