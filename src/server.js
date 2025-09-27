const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cronSvc = require('node-cron');

// const database = require('./database');
const database = require('./db_sqlite');

const auth = require('./auth');
const WarehouseDetective = require('./main');
const inventoryService = require('./inventoryService');
const analysisService = require('./analysisService');
const fetch = require('node-fetch');

let token = null;
class WebServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.scheduledTasks = new Map();
    this.isGlobalTaskRunning = false; // 全局任务运行状态
    this.currentTaskUser = null; // 当前执行任务的用户

    // 添加夕之悦认证信息缓存
    this.xizhiyueAuthInfo = {
      cookies: null,
      token: null,
      lastUpdated: null
    };

    // 修复：确保 serverBaseUrl 有默认值
    this.serverBaseUrl = process.env.SERVER_URL || 'http://localhost:3000';

    // 添加调试信息
    console.log('服务器基础URL:', this.serverBaseUrl);
    this.setupMiddleware();
    this.setupRoutes();
  }

  // 公共方法：检查认证信息是否有效
  isAuthInfoValid(authInfo, maxAge = 60 * 60 * 1000) {
    if (!authInfo || !authInfo.lastUpdated) return false;
    return (Date.now() - authInfo.lastUpdated) < maxAge;
  }

  // 公共方法：获取夕之悦认证信息（带缓存和自动刷新）
  async getXizhiyueAuthInfo(forceLogin = false) {
    if (!forceLogin && this.isAuthInfoValid(this.xizhiyueAuthInfo)) {
      console.log('使用缓存的认证信息');
      return this.xizhiyueAuthInfo;
    }

    try {
        const url = `https://customer.westmonth.com/login_v2`;
        const body = { area_code: `+86`, account: "18575215654", password: "FUNyaxN9SSB9WiPA5Xhz096kgDmlKag3tOqfoT0sUonuj7YHEANZOt8HD13Rq6q4edNaHsbAHw/+Kghrw+Muw96y+xKL1W8tfl29aQj8+TC6Ht257OXVWGvYQmxgQQtQymzhCitziKwi3lFGP+Kpv+ZaCjIwpqV4jlqlgrbwvLsYep31USgj80nAhll4tYDVEDNM29GfP8zvdC2MLMt8mNRZzMlTNwtcII9vA1J4mKjfQR6OKpSt7nWu90iUYD4bgRU70PfWdJrJ3JBYcrBUeVcNWid0gQMc4cl4SzxgyiqXrocqk5KIg8U/h/2yOUa/c3x77wXoEKb0dEuzAlPo5A==", type: `1` };
        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome'
          },
          body: JSON.stringify(body)
        }
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`获取token请求失败: ${response.status} ${response.statusText}`);
        }
        const res = await response.json();
        const access_token = res.data.access_token;

        this.xizhiyueAuthInfo = {
            token: access_token,
            lastUpdated: Date.now()
        };
        console.log('获取新的认证信息成功');
        return this.xizhiyueAuthInfo;
    } catch (error) {
      console.error('获取认证信息失败:', error);
      throw error;
    }
  }

  // 公共方法：使用认证信息发送请求（带自动重试）
  async makeAuthenticatedRequest(url, options = {}, maxRetries = 2) {
    let authInfo = await this.getXizhiyueAuthInfo();
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const requestOptions = {
          ...options,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Authorization': authInfo.token ? `Bearer ${authInfo.token}` : '',
            ...options.headers
          }
        };
        const response = await fetch(url, requestOptions);
        if (response.status === 401 || response.status === 403) {
          if (attempt < maxRetries) {
            console.log(`认证失效，尝试重新登录 (尝试 ${attempt + 1}/${maxRetries})`);
            authInfo = await this.getXizhiyueAuthInfo(true);
            continue;
          } else {
            throw new Error(`认证失败: ${response.status} ${response.statusText}`);
          }
        }
        if (!response.ok) {
            const rawText = await response.text();
            throw new Error(`请求失败: ${response.status} ${response.statusText}，返回内容: ${rawText}`);
        }
        return await response.json();
      } catch (error) {
        if (attempt >= maxRetries) throw error;
        console.log(`请求失败，准备重试: ${error.message}`);
      }
    }
  }

  setupMiddleware() {
    // 安全中间件
    this.app.use(helmet({
        contentSecurityPolicy: false, // 暂时禁用 CSP 以进行调试
    }));
    this.app.use(cors({
      origin: '*',//process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true
    }));

    // 限流中间件 (暂时禁用以进行调试)
    /*
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15分钟
      max: 100 // 限制每个IP 15分钟内最多100个请求
    });
    this.app.use(limiter);
    */

    // 解析中间件
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // 会话中间件
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'warehouse-detective-session',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24小时
      }
    }));

    // 静态文件服务
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  setupRoutes() {
    // 认证路由
    this.setupAuthRoutes();

    // 用户管理路由
    this.setupUserRoutes();

    // 配置管理路由
    this.setupConfigRoutes();

    // 任务执行路由
    this.setupTaskRoutes();

    // 结果查看路由
    this.setupResultRoutes();

    // 调度管理路由
    this.setupScheduleRoutes();

    // 夕之悦数据获取路由 - 添加这行
    this.setupFetchXizhiyueData();

    // 库存跟踪路由
    this.setupInventoryRoutes();

    // 前端页面路由
    this.setupPageRoutes();

    // 错误处理
    this.setupErrorHandling();
  }

  setupAuthRoutes() {
    // 用户登录
    this.app.post('/api/auth/login', async (req, res) => {
      try {
        const { username, password } = req.body;

        if (!username || !password) {
          return res.status(400).json({ error: '用户名和密码不能为空' });
        }

        const result = await auth.login(username, password);
        res.json(result);
      } catch (error) {
        res.status(401).json({ error: error.message });
      }
    });

    // 用户注册
    this.app.post('/api/auth/register', async (req, res) => {
      try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
          return res.status(400).json({ error: '用户名、邮箱和密码不能为空' });
        }

        if (password.length < 6) {
          return res.status(400).json({ error: '密码长度至少6位' });
        }

        const result = await auth.register({ username, email, password });
        res.status(201).json(result);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // 验证令牌
    this.app.get('/api/auth/verify', auth.authenticateToken.bind(auth), (req, res) => {
      res.json({ user: req.user });
    });

    // 检查会话状态 (用于前端轮询)
    this.app.get('/api/auth/check-session', auth.authenticateToken.bind(auth), (req, res) => {
      // 如果 authenticateToken 中间件通过，说明会话是有效的
      res.json({ isValid: true });
    });
  }

  setupUserRoutes() {
    // 获取所有用户（仅管理员）
    this.app.get('/api/users',
      auth.authenticateToken.bind(auth),
      auth.requireAdmin.bind(auth),
      (req, res) => {
        try {
          const users = database.getAllUsers().map(u => {
            const { password, ...userWithoutPassword } = u;
            return userWithoutPassword;
          });
          res.json(users);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 创建新用户 (仅管理员)
    this.app.post('/api/users',
        auth.authenticateToken.bind(auth),
        auth.requireAdmin.bind(auth),
        async (req, res) => {
            try {
                const { username, email, password } = req.body;
                if (!username || !email || !password) {
                    return res.status(400).json({ error: '用户名、邮箱和密码不能为空' });
                }
                if (password.length < 6) {
                    return res.status(400).json({ error: '密码长度至少6位' });
                }
                // 默认创建普通用户
                const result = await auth.register({ username, email, password, role: 'user' });
                res.status(201).json(result);
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        }
    );

    // 获取用户信息
    this.app.get('/api/users/:id',
      auth.authenticateToken.bind(auth),
      auth.requireUserOrAdmin.bind(auth),
      (req, res) => {
        try {
          const user = database.findUserById(parseInt(req.params.id));
          if (!user) {
            return res.status(404).json({ error: '用户不存在' });
          }
          const { password, ...userWithoutPassword } = user;
          res.json(userWithoutPassword);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 更新用户信息
    this.app.put('/api/users/:id',
      auth.authenticateToken.bind(auth),
      auth.requireUserOrAdmin.bind(auth),
      (req, res) => {
        try {
          const userId = parseInt(req.params.id);
          const updateData = req.body;

          // 普通用户不能修改自己的角色，只有管理员可以
          if (req.user.role !== 'admin') {
            delete updateData.role;
          }

          // 如果密码字段存在且不为空，则进行哈希处理
          if (updateData.password) {
              const bcrypt = require('bcryptjs');
              updateData.password = bcrypt.hashSync(updateData.password, 10);
          }

          const updatedUser = database.updateUser(userId, updateData);
          if (!updatedUser) {
            return res.status(404).json({ error: '用户不存在' });
          }
          
          const { password, ...userWithoutPassword } = updatedUser;
          res.json(userWithoutPassword);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 删除用户（仅管理员）
    this.app.delete('/api/users/:id',
      auth.authenticateToken.bind(auth),
      auth.requireAdmin.bind(auth),
      (req, res) => {
        try {
          const userId = parseInt(req.params.id);

          // 不能删除自己
          if (userId === req.user.id) {
            return res.status(400).json({ error: '不能删除自己的账户' });
          }

          const success = database.deleteUser(userId);
          if (!success) {
            return res.status(404).json({ error: '用户不存在' });
          }

          res.json({ message: '用户删除成功' });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );
  }

  setupConfigRoutes() {
    // 获取配置列表
    this.app.get('/api/configs',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const configs = database.getConfigs();
          res.json(configs);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 创建配置
    this.app.post('/api/configs',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const configData = {
            ...req.body,
            userId: req.user.id
          };

          const newConfig =
            database.saveConfig(configData);
          res.status(201).json(newConfig);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 获取配置详情
    this.app.get('/api/configs/:id',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const config = database.getConfigById(parseInt(req.params.id));
          if (!config) {
            return res.status(404).json({ error: '配置不存在' });
          }
          res.json(config);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 更新配置
    this.app.put('/api/configs/:id',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const configId = parseInt(req.params.id);
          const updatedConfig = database.updateConfig(configId, req.body);

          if (!updatedConfig) {
            return res.status(404).json({ error: '配置不存在' });
          }

          res.json(updatedConfig);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 删除配置
    this.app.delete('/api/configs/:id',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const configId = parseInt(req.params.id);
          const success = database.deleteConfig(configId);

          if (!success) {
            return res.status(404).json({ error: '配置不存在' });
          }

          res.json({ message: '配置删除成功' });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );
  }

  setupTaskRoutes() {
    // 立即执行任务
    this.app.post('/api/tasks/run',
      auth.authenticateToken.bind(auth),
      async (req, res) => { // 添加 async
        try {
          // 检查全局任务状态
          if (this.isGlobalTaskRunning) {
            return res.status(409).json({
              error: '系统正在执行其他任务，请稍后再试',
              currentUser: this.currentTaskUser
            });
          }

          const { skus, regions, configId } = req.body;

          // 设置全局任务状态
          this.isGlobalTaskRunning = true;
          this.currentTaskUser = req.user.username;

          let config = {};
          if (configId) {
            const savedConfig = database.getConfigById(configId);
            if (savedConfig) {
              config = savedConfig;
            }
          }

          try {
            // 执行任务
            const results = await this.executeTask(skus || config.skus, regions || config.regions);

            // 保存结果
            const savedResult = database.saveResult({
              userId: req.user.id,
              configId: configId || null,
              skus: skus || config.skus,
              regions: regions || config.regions,
              results: results,
              status: 'completed'
            });

            res.json(savedResult);
          } catch (error) {
            console.error('任务执行保存数据失败:', error);
          } finally {
            // 无论成功还是失败，都要重置全局任务状态
            this.isGlobalTaskRunning = false;
            this.currentTaskUser = null;
          }
        } catch (error) {
          console.error('任务执行失败:', error);
          // 确保在错误情况下也重置状态
          this.isGlobalTaskRunning = false;
          this.currentTaskUser = null;
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 获取任务状态
    this.app.get('/api/tasks/status',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        res.json({
          scheduledTasks: Array.from(this.scheduledTasks.keys()),
          totalScheduled: this.scheduledTasks.size,
          isGlobalTaskRunning: this.isGlobalTaskRunning,
          currentTaskUser: this.currentTaskUser
        });
      }
    );
  }

  setupResultRoutes() {
    // 获取结果列表
    this.app.get('/api/results',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const { limit = 50, offset = 0, scheduled } = req.query;
          let results = database.getResults(parseInt(limit), parseInt(offset));

          // 根据scheduled参数过滤结果
          if (scheduled === 'true') {
            results = results.filter(result => result.isScheduled === 1);
          } else if (scheduled === 'false') {
            results = results.filter(result => result.isScheduled === 0);
          }

          res.json(results);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 获取结果详情
    this.app.get('/api/results/:id',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const result = database.getResultById(parseInt(req.params.id));
          if (!result) {
            return res.status(404).json({ error: '结果不存在' });
          }
          res.json(result);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );
  }

  setupScheduleRoutes() {
    // 创建定时任务
    this.app.post('/api/schedules',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const { name, cron, configId, isActive = true } = req.body;
          console.log("save cron :" + JSON.stringify(req.body));
          if (!cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的cron表达式' });
          }

          const scheduleData = {
            name,
            cron,
            configId,
            userId: req.user.id,
            isActive
          };

          const newSchedule = database.saveSchedule(scheduleData);

          if (isActive) {
            this.startScheduledTask(newSchedule);
          }

          res.status(201).json(newSchedule);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );
    // 获取配置详情
    this.app.get('/api/schedules/:id',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const schedule = database.getScheduleById(parseInt(req.params.id));
          if (!schedule) {
            return res.status(404).json({ error: '定时任务不存在' });
          }
          res.json(schedule);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );
    // 获取定时任务列表
    this.app.get('/api/schedules',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const schedules = database.getSchedules();
          res.json(schedules);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 更新定时任务
    this.app.put('/api/schedules/:id',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const scheduleId = parseInt(req.params.id);
          const updateData = req.body;

          if (updateData.cron && !cronSvc.validate(updateData.cron)) {
            return res.status(400).json({ error: '无效的cron表达式' });
          }

          const updatedSchedule = database.updateSchedule(scheduleId, updateData);

          if (!updatedSchedule) {
            return res.status(404).json({ error: '定时任务不存在' });
          }

          // 重新启动定时任务
          this.stopScheduledTask(scheduleId);
          if (updatedSchedule.isActive) {
            this.startScheduledTask(updatedSchedule);
          }

          res.json(updatedSchedule);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 删除定时任务
    this.app.delete('/api/schedules/:id',
      auth.authenticateToken.bind(auth),
      (req, res) => {
        try {
          const scheduleId = parseInt(req.params.id);

          this.stopScheduledTask(scheduleId);
          const success = database.deleteSchedule(scheduleId);

          if (!success) {
            return res.status(404).json({ error: '定时任务不存在' });
          }

          res.json({ message: '定时任务删除成功' });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );
  }


  setupFetchXizhiyueData() {
    // 添加认证信息缓存
    this.xizhiyueAuthInfo = {
      cookies: null,
      token: null,
      lastUpdated: null
    };

    this.app.get('/api/xizhiyue/login',
      async (req, res) => {
        try {
          const url = `https://customer.westmonth.com/login_v2`;
          const body = { area_code: `+86`, login_name: "18575215654", password: "FUNyaxN9SSB9WiPA5Xhz096kgDmlKag3tOqfoT0sUonuj7YHEANZOt8HD13Rq6q4edNaHsbAHw/+Kghrw+Muw96y+xKL1W8tfl29aQj8+TC6Ht257OXVWGvYQmxgQQtQymzhCitziKwi3lFGP+Kpv+ZaCjIwpqV4jlqlgrbwvLsYep31USgj80nAhll4tYDVEDNM29GfP8zvdC2MLMt8mNRZzMlTNwtcII9vA1J4mKjfQR6OKpSt7nWu90iUYD4bgRU70PfWdJrJ3JBYcrBUeVcNWid0gQMc4cl4SzxgyiqXrocqk5KIg8U/h/2yOUa/c3x77wXoEKb0dEuzAlPo5A==", type: `1` };
          const options = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome'
            },
            body: JSON.stringify(body)
          }

          const response = await fetch(url, options); // 强制登录
          // 如果认证失败，尝试重新登录
          if (response.status === 401 || response.status === 403) {
            throw new Error(`获取token失败: ${response.status} ${response.statusText}`);
          }

          if (!response.ok) {
            throw new Error(`获取token请求失败: ${response.status} ${response.statusText}`);
          }

          return await response.json();
        }
        catch (error) {
          console.log(`获取token请求失败:`, error);
          throw new Error(`获取token请求失败:`, error);
        }
      });


    // 获取商品列表
    this.app.get('/api/xizhiyue/products',
      // auth.authenticateToken.bind(auth),
      async (req, res) => {
        try {
          const regionId = req.query.regionId || '6';
          const page = req.query.page || '1';
          const pageSize = req.query.pagesize || '100';
          const sortField = req.query.sort_field || '2';
          const sortMode = req.query.sort_mode || '2';

          const url = `https://westmonth.com/shop_api/products/load_list?delivery_region_id=${regionId}&sort_field=${sortField}&sort_mode=${sortMode}&page=${page}&pagesize=${pageSize}`;

          const data = await this.makeAuthenticatedRequest(url);
          res.json(data);
        } catch (error) {
          console.error('获取商品列表失败:', error);
          res.status(500).json({ error: error.message });
        }
      }
    );
    // 获取商品详情
    this.app.get('/api/xizhiyue/product/:productId',
      // auth.authenticateToken.bind(auth),
      async (req, res) => {
        try {
          const productId = req.params.productId;
          const regionId = req.query.regionId || '6';

          const url = `https://westmonth.com/shop_api/products/detail?product_id=${productId}&delivery_region_id=${regionId}`;

          const data = await this.makeAuthenticatedRequest(url);
          res.json(data);
        } catch (error) {
          console.error('获取商品详情失败:', error);
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 获取商品库存
    this.app.get('/api/xizhiyue/productInventories/',
      // auth.authenticateToken.bind(auth),
      async (req, res) => {
        try {
          console.log(`asdqwe1231231231`);
          const productId = req.query.productId;
          const productSkuId = req.query.productSkuId;
          const regionId = req.query.regionId || '6';

          const url = `https://westmonth.com/shop_api/products/system-price?quantity=1&service_type=2&delivery_type=-1&is_wholesale=2&product_id=${productId}&product_sku_id=${productSkuId}&delivery_region_id=${regionId}`;

          const options = { method: 'GET' };
          const data = await this.makeAuthenticatedRequest(url, options);
          res.json(data);
        } catch (error) {
          console.error('获取商品库存失败:', error);
          res.status(500).json({ error: error.message });
        }
      }
    );
    // 保存商品数据路由
    this.app.post("/api/xizhiyue/saveProducts",
      // auth.authenticateToken.bind(auth),
      async (req, res) => {
        try {
          const { apiData, regionId = '6' } = req.body;

          if (!apiData) {
            return res.status(400).json({ error: '缺少apiData参数' });
          }

          const result = await this.processAndSaveProductData(apiData, regionId);
          res.json(result);
        } catch (error) {
          console.error('保存商品数据失败:', error);
          res.status(500).json({ error: error.message });
        }
      }
    );
    // 获取库存信息
    this.app.get('/api/xizhiyue/inventory',
      // auth.authenticateToken.bind(auth),
      async (req, res) => {
        try {
          const sku = req.query.sku;
          const regionId = req.query.regionId || '6';

          if (!sku) {
            return res.status(400).json({ error: '缺少SKU参数' });
          }

          const url = `https://westmonth.com/shop_api/products/inventory?sku=${encodeURIComponent(sku)}&delivery_region_id=${regionId}`;

          const data = await this.makeAuthenticatedRequest(url);
          res.json(data);
        } catch (error) {
          console.error('获取库存信息失败:', error);
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 搜索商品
    this.app.get('/api/xizhiyue/search',
      // auth.authenticateToken.bind(auth),
      async (req, res) => {
        try {
          const keyword = req.query.keyword;
          const regionId = req.query.regionId || '6';
          const page = req.query.page || '1';

          if (!keyword) {
            return res.status(400).json({ error: '缺少搜索关键词' });
          }

          const url = `https://westmonth.com/shop_api/products/search?keyword=${encodeURIComponent(keyword)}&delivery_region_id=${regionId}&page=${page}`;

          const data = await this.makeAuthenticatedRequest(url);
          res.json(data);
        } catch (error) {
          console.error('搜索商品失败:', error);
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 获取分类列表
    this.app.get('/api/xizhiyue/categories',
      // auth.authenticateToken.bind(auth),
      async (req, res) => {
        try {
          const url = 'https://westmonth.com/shop_api/categories/list';

          const data = await this.makeAuthenticatedRequest(url);
          res.json(data);
        } catch (error) {
          console.error('获取分类列表失败:', error);
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 手动刷新认证信息
    this.app.post('/api/xizhiyue/refresh-auth',
      // auth.authenticateToken.bind(auth),
      async (req, res) => {
        try {
          await this.getXizhiyueAuthInfo(true); // 强制刷新
          res.json({ message: '认证信息刷新成功', lastUpdated: new Date().toISOString() });
        } catch (error) {
          console.error('刷新认证信息失败:', error);
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 获取认证状态
    this.app.get('/api/xizhiyue/auth-status',
      // auth.authenticateToken.bind(auth),
      async (req, res) => {
        try {
          const isValid = this.isAuthInfoValid(this.xizhiyueAuthInfo);
          res.json({
            isAuthenticated: isValid,
            lastUpdated: this.xizhiyueAuthInfo.lastUpdated,
            hasCookies: !!this.xizhiyueAuthInfo.cookies,
            hasToken: !!this.xizhiyueAuthInfo.token,
            age: isValid ? Math.round((Date.now() - this.xizhiyueAuthInfo.lastUpdated) / 1000) : null
          });
        } catch (error) {
          console.error('获取认证状态失败:', error);
          res.status(500).json({ error: error.message });
        }
      }
    );

  }

  // 检查认证信息是否有效（1小时内有效）
  isAuthInfoValid(authInfo) {
    if (!authInfo.lastUpdated) return false;
    const oneHour = 60 * 60 * 1000;
    return (Date.now() - authInfo.lastUpdated) < oneHour;
  }

  // 获取夕之悦认证信息
  // async getXizhiyueAuthInfo(forceLogin = false) {
  //   let detective = null;
  //   try {
  //     detective = new WarehouseDetective();
  //     await detective.init();

  //     if (forceLogin) {
  //       detective.clearAuthCache(); // 强制重新登录
  //     }

  //     const authInfo = await detective.getAuthInfo();

  //     return {
  //       cookies: authInfo.cookies,
  //       token: authInfo.token,
  //       lastUpdated: Date.now()
  //     };
  //   } catch (error) {
  //     console.error('获取认证信息失败:', error);
  //     throw error;
  //   } finally {
  //     if (detective) {
  //       await detective.close();
  //     }
  //   }
  // }

  // 执行仓库检测任务
  async executeTask(skus, regions) {
    let detective = null;
    try {
      detective = new WarehouseDetective();
      await detective.init();

      const loginSuccess = await detective.loginXZY();
      if (!loginSuccess) {
        throw new Error('登录失败');
      }

      const skuList = Array.isArray(skus) ? skus : [skus];
      const regionList = Array.isArray(regions) ? regions : [regions];

      // 使用 searchSkuList 而不是 run 方法，避免重复初始化
      const results = await detective.searchSkuList(skuList, regionList);

      try {
        // 发送邮件 - 修复：使用 results 而不是 this.results
        await detective.sendEmailWithAttach(results, skuList, regionList);
      } catch (error) {
        console.error('截图发送邮件过程中出错:', error);
        return results;

      }
      return results;
    } catch (error) {
      console.error('任务执行失败:', error);
      throw error;
    } finally {
      // 确保浏览器实例被正确关闭
      if (detective) {
        await detective.close().catch(err => {
          console.error('关闭浏览器实例时出错:', err);
        });
      }
    }
  }

  // 启动定时任务
  startScheduledTask(schedule) {
    // 如果任务已经存在，先停止它
    if (this.scheduledTasks.has(schedule.id)) {
      this.stopScheduledTask(schedule.id);
    }

    // 确保使用正确的 cron 表达式字段
    const cronExpression = schedule.cron;

    if (!cronSvc.validate(cronExpression)) {
      console.error(`无效的cron表达式: ${cronExpression} (任务ID: ${schedule.id})`);
      return;
    }

    const task = cronSvc.schedule(cronExpression, async () => {
      // 检查全局任务状态，避免并发执行
      if (this.isGlobalTaskRunning) {
        console.log(`任务 ${schedule.name} 等待中，已有任务正在执行`);
        return;
      }

      try {
        this.isGlobalTaskRunning = true;
        this.currentTaskUser = `Scheduled Task ${schedule.id}`;

        console.log(`执行定时任务: ${schedule.name} (ID: ${schedule.id})`);

        const config = database.getConfigById(schedule.configId);
        if (!config) {
          console.error(`配置不存在: ${schedule.configId}`);
          return;
        }

        // 使用统一的 executeTask 方法，确保浏览器实例正确管理
        const results = await this.executeTask(config.skus, config.regions);

        database.saveResult({
          userId: schedule.userId,
          configId: schedule.configId,
          skus: config.skus,
          regions: config.regions,
          results: results,
          status: 'completed',
          isScheduled: true,
          scheduleId: schedule.id
        });

        console.log(`定时任务完成: ${schedule.name} (ID: ${schedule.id})`);
      } catch (error) {
        console.error(`定时任务执行失败: ${schedule.name} (ID: ${schedule.id})`, error);

        // 保存失败状态
        database.saveResult({
          userId: schedule.userId,
          configId: schedule.configId,
          skus: config.skus,
          regions: config.regions,
          results: [],
          status: 'failed',
          isScheduled: true,
          scheduleId: schedule.id,
          error: error.message
        });
      } finally {
        // 无论成功失败，都重置状态
        this.isGlobalTaskRunning = false;
        this.currentTaskUser = null;
      }
    }, {
      scheduled: true,
      timezone: "Asia/Shanghai" // 设置时区
    });

    this.scheduledTasks.set(schedule.id, task);
    console.log(`定时任务已启动: ${schedule.name} (ID: ${schedule.id}, Cron: ${cronExpression})`);
  }

  // 停止定时任务
  stopScheduledTask(scheduleId) {
    const task = this.scheduledTasks.get(scheduleId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(scheduleId);
      console.log(`定时任务已停止: ${scheduleId}`);
    }
  }

  // 启动所有活跃的定时任务
  async startAllScheduledTasks() {
    // 启动内置的每日库存更新任务
    this.startDailyInventoryUpdateTask();
    this.startDailyAnalysisTask(); // 添加这行

    try {
      const schedules = database.getSchedules();
      const activeSchedules = schedules.filter(schedule => schedule.isActive);

      for (const schedule of activeSchedules) {
        this.startScheduledTask(schedule);
      }

      console.log(`已启动 ${activeSchedules.length} 个定时任务`);
    } catch (error) {
      console.error('启动定时任务失败:', error);
    }
  }

  // 启动每日库存更新的内置定时任务
  startDailyInventoryUpdateTask() {
    const taskName = 'daily-inventory-update';
    // 每天凌晨2点执行: '0 2 * * *'
    const cronExpression = '0 2 * * *';

    if (!cronSvc.validate(cronExpression)) {
      console.error(`内置库存更新任务的 cron 表达式无效: ${cronExpression}`);
      return;
    }

    // 检查任务是否已在运行
    if (this.scheduledTasks.has(taskName)) {
        console.log('每日库存更新任务已在运行中。');
        return;
    }

    const task = cronSvc.schedule(cronExpression, async () => {
      console.log('开始执行每日定时库存更新任务...');
      try {
        const authInfo = await this.getXizhiyueAuthInfo();
        await inventoryService.fetchAndSaveAllTrackedSkus(authInfo.token);
        console.log('每日定时库存更新任务成功完成。');
      } catch (error) {
        console.error('每日定时库存更新任务执行失败:', error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Shanghai"
    });

    this.scheduledTasks.set(taskName, task);
    console.log(`已启动每日库存更新任务，cron: ${cronExpression}`);
  }

  // 启动每日库存分析的内置定时任务
  startDailyAnalysisTask() {
    const taskName = 'daily-inventory-analysis';
    // 每天凌晨3点执行: '0 3 * * *'
    const cronExpression = '0 3 * * *';

    if (!cronSvc.validate(cronExpression)) {
      console.error(`内置库存分析任务的 cron 表达式无效: ${cronExpression}`);
      return;
    }

    if (this.scheduledTasks.has(taskName)) {
        console.log('每日库存分析任务已在运行中。');
        return;
    }

    const task = cronSvc.schedule(cronExpression, async () => {
      console.log('开始执行每日定时库存分析任务...');
      try {
        await analysisService.runInventoryAnalysis();
        console.log('每日定时库存分析任务成功完成。');
      } catch (error) {
        console.error('每日定时库存分析任务执行失败:', error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Shanghai"
    });

    this.scheduledTasks.set(taskName, task);
    console.log(`已启动每日库存分析任务，cron: ${cronExpression}`);
  }

  // 处理并保存商品数据到单表
  async processAndSaveProductData(apiData, regionId = '6') {
    try {
      if (!apiData || !apiData.data || !apiData.data.data) {
        throw new Error('无效的API数据');
      }

      const products = apiData.data.data;
      const results = [];

      for (const product of products) {
        const savedProduct = await this.saveProductToSingleTable(product, regionId);
        results.push(savedProduct);
      }

      res.json({
        total: apiData.data.total,
        page: apiData.data.page,
        pagesize: apiData.data.pagesize,
        processed: results.length,
        results: results
      });
    } catch (error) {
      console.error('处理商品数据失败:', error);
      throw error;
    }

  }

  // 保存商品信息到单表
  async saveProductToSingleTable(product, targetRegionId) {
    // 获取目标地区的库存信息
    const targetRegionInfo = this.getTargetRegionInfo(product, targetRegionId);
    console.log("-------product_name :" + targetRegionInfo.product_name + ",quantity:" + targetRegionInfo.quantity);
    const productData = {
      product_sku_id: product.product_sku_id,
      product_id: product.product_id,
      product_sku: product.product_sku,
      product_name: product.product_name,
      product_image: product.product_image,

      // 销售信息
      month_sales: parseInt(product.month_sales) || 0,
      product_price: product.product_price,
      is_hot_sale: product.is_hot_sale ? 1 : 0,
      is_new: product.is_new ? 1 : 0,
      is_seckill: product.is_seckill ? 1 : 0,
      is_wish: product.is_wish ? 1 : 0,

      // 目标地区信息
      target_region_id: parseInt(targetRegionId),
      target_region_name: targetRegionInfo.region_name,
      target_region_code: targetRegionInfo.region_code,
      target_quantity: targetRegionInfo.quantity,
      target_price: targetRegionInfo.price,
      target_stock_status: this.determineStockStatus(targetRegionInfo.quantity),

      // JSON格式存储的完整信息
      all_regions_inventory: JSON.stringify(product.delivery_regions || {}),
      product_certificate: JSON.stringify(product.product_certificate || []),
      product_categories: JSON.stringify(product.product_categories || []),
      product_attributes: JSON.stringify(product.product_attributes || []),
      formatted_attributes: JSON.stringify(product.attributes || {}),
      delivery_regions: JSON.stringify(product.delivery_regions || {}),

      // 价格信息
      member_price: product.member_price,
      price_currency: product.price_currency,
      price_currency_symbol: product.price_currency_symbol,
      base_price: product.base_price,
      guide_price: product.guide_price,
      real_price: product.real_price,

      // 时间信息
      product_addtime: product.product_addtime
    };

    // 检查是否已存在
    const existingProduct = database.getXizhiyueProductBySkuId(product.product_sku_id);

    if (existingProduct) {
      // 更新现有商品
      return database.updateXizhiyueProduct(product.product_sku_id, productData);
    } else {
      // 插入新商品
      return database.createXizhiyueProduct(productData);
    }
  }

  // 获取目标地区信息
  getTargetRegionInfo(product, targetRegionId) {
    if (product.delivery_regions && product.delivery_regions[targetRegionId]) {
      const regionData = product.delivery_regions[targetRegionId][0];
      return {
        region_name: regionData.delivery_region_name,
        region_code: regionData.delivery_region_code,
        quantity: parseInt(regionData.qty) || 0,
        price: regionData.product_price
      };
    }

    // 如果没有目标地区信息，返回默认值或第一个可用地区
    if (product.delivery_regions) {
      const firstRegionKey = Object.keys(product.delivery_regions)[0];
      if (firstRegionKey && product.delivery_regions[firstRegionKey][0]) {
        const firstRegion = product.delivery_regions[firstRegionKey][0];
        return {
          region_name: firstRegion.delivery_region_name,
          region_code: firstRegion.delivery_region_code,
          quantity: parseInt(firstRegion.qty) || 0,
          price: firstRegion.product_price
        };
      }
    }

    // 默认值
    return {
      region_name: '未知地区',
      region_code: 'UNKNOWN',
      quantity: 0,
      price: '¥0.00'
    };
  }

  // 判断库存状态
  determineStockStatus(quantity) {
    if (quantity === 0) return '缺货';
    if (quantity > 0 && quantity <= 10) return '库存紧张';
    if (quantity > 10 && quantity <= 100) return '有货';
    if (quantity > 100) return '库存充足';
    return '未知';
  }

  // 获取商品信息的封装方法
  async getProductInfo(regionId = '6', page = '1', pageSize = '100') {
    try {
      const url = `https://westmonth.com/shop_api/products/load_list?delivery_region_id=${regionId}&sort_field=2&sort_mode=2&page=${page}&pagesize=${pageSize}`;

      // 使用认证请求获取数据
      const apiData = await this.makeAuthenticatedRequest(url);

      // 处理并保存数据
      const processedData = await this.processAndSaveProductData(apiData, regionId);

      // 格式化返回结果
      return this.formatProductResponse(processedData);
    } catch (error) {
      console.error('获取商品信息失败:', error);
      throw error;
    }
  }

  // 格式化返回结果
  formatProductResponse(processedData) {
    const formattedProducts = processedData.results.map(product => ({
      product_sku_id: product.product_sku_id,
      product_sku: product.product_sku,
      product_name: product.product_name,
      product_image: product.product_image,
      month_sales: product.month_sales,

      // 目标地区信息
      target_region: {
        region_id: product.target_region_id,
        region_name: product.target_region_name,
        region_code: product.target_region_code,
        quantity: product.target_quantity,
        price: product.target_price,
        stock_status: product.target_stock_status
      },

      // 基础价格信息
      base_price: product.product_price,
      member_price: product.member_price,
      price_currency: product.price_currency,

      // 商品状态
      is_hot: product.is_hot_sale,
      is_new: product.is_new,

      // 解析JSON字段
      certificates: JSON.parse(product.product_certificate || '[]'),
      categories: JSON.parse(product.product_categories || '[]'),
      attributes: JSON.parse(product.formatted_attributes || '{}'),

      // 所有地区信息（可选返回）
      all_regions: product.all_regions_inventory ? JSON.parse(product.all_regions_inventory) : {}
    }));

    return {
      status: 'success',
      total: processedData.total,
      page: processedData.page,
      pagesize: processedData.pagesize,
      region_id: processedData.results[0]?.target_region_id || 6,
      data: formattedProducts
    };
  }

  setupPageRoutes() {
    // 主页
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    // 登录页
    this.app.get('/login', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/login.html'));
    });

    // 管理后台
    this.app.get('/admin', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/admin.html'));
    });

    // 结果页面
    this.app.get('/results', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/results.html'));
    });
  }

  setupInventoryRoutes() {
    const router = express.Router();

    // 获取所有跟踪的 SKU
    router.get('/skus', (req, res) => {
      try {
        const skus = database.getTrackedSkus();
        res.json(skus);
      } catch (error) {
        res.status(500).json({ error: '获取 SKU 列表失败: ' + error.message });
      }
    });

    // 添加或更新一个跟踪的 SKU
    router.post('/skus', async (req, res) => {
        const { sku } = req.body;
        if (!sku) {
            return res.status(400).json({ error: 'SKU 不能为空' });
        }
        try {
            const authInfo = await this.getXizhiyueAuthInfo();
            const trackedSku = await inventoryService.addOrUpdateTrackedSku(sku, authInfo.token);
            if (trackedSku) {
                res.status(201).json(trackedSku);
            } else {
                res.status(404).json({ error: `无法找到 SKU ${sku} 的信息` });
            }
        } catch (error) {
            res.status(500).json({ error: '添加 SKU 失败: ' + error.message });
        }
    });

    // 删除一个 SKU
    router.delete('/skus/:id', (req, res) => {
      const { id } = req.params;
      try {
        // 在删除前检查是否有历史记录
        const hasHistory = database.hasInventoryHistory(id);
        if (hasHistory) {
          // 这是一个软提示，实际删除由 FOREIGN KEY ON DELETE CASCADE 处理
          // 前端可以根据这个 'hasHistory' 字段来显示不同的确认信息
        }
        const success = database.deleteTrackedSku(id);
        if (success) {
          res.json({ message: 'SKU 删除成功' });
        } else {
          res.status(404).json({ error: '未找到要删除的 SKU' });
        }
      } catch (error) {
        res.status(500).json({ error: '删除 SKU 失败: ' + error.message });
      }
    });
    
    // 检查特定SKU是否有历史记录
    router.get('/skus/:id/has-history', (req, res) => {
        const { id } = req.params;
        try {
            const hasHistory = database.hasInventoryHistory(id);
            res.json({ hasHistory });
        } catch (error) {
            res.status(500).json({ error: '检查历史记录失败: ' + error.message });
        }
    });

    // 获取特定 SKU 的库存历史
    router.get('/history/:skuId', (req, res) => {
        const { skuId } = req.params;
        try {
            const data = inventoryService.getInventoryHistoryBySku(skuId);
            if (data) {
                res.json(data);
            } else {
                res.status(404).json({ error: '未找到该 SKU 的历史记录' });
            }
        } catch (error) {
            res.status(500).json({ error: '获取库存历史失败: ' + error.message });
        }
    });

    // 获取特定 SKU 的区域库存历史
    router.get('/regional-history/:skuId', (req, res) => {
        const { skuId } = req.params;
        try {
            const history = database.getRegionalInventoryHistoryBySkuId(skuId);
            const skuDetails = database.getTrackedSkus().find(s => s.id == skuId);
            res.json({
                history,
                sku: skuDetails ? skuDetails.sku : 'N/A',
                product_image: skuDetails ? skuDetails.product_image : null,
            });
        } catch (error) {
            res.status(500).json({ error: '获取区域库存历史失败: ' + error.message });
        }
    });

    // 立即触发一次查询
    router.post('/fetch-now', async (req, res) => {
        try {
            const authInfo = await this.getXizhiyueAuthInfo();
            const results = await inventoryService.fetchAndSaveAllTrackedSkus(authInfo.token);
            // 同时更新 tracked_skus 表中的信息
            for (const sku of database.getTrackedSkus()) {
                await inventoryService.addOrUpdateTrackedSku(sku.sku, authInfo.token);
            }
            res.json(results);
        } catch (error) {
            res.status(500).json({ error: '立即查询失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                res.json(schedule);
            } else {
                res.json(null); // 明确返回 null
            }
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            res.json(schedule);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            res.json(schedule);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            res.json(schedule);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            res.json(schedule);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            res.json(schedule);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            res.json(schedule);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            res.json(schedule);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            res.json(schedule);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            res.json(schedule);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            res.json(schedule);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取库存更新定时任务
    router.get('/schedule', (req, res) => {
        try {
            const schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            res.json(schedule);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务失败: ' + error.message });
        }
    });

    // 更新库存更新定时任务
    router.post('/schedule', (req, res) => {
        const { cron } = req.body;
        if (!cron || !cronSvc.validate(cron)) {
            return res.status(400).json({ error: '无效的 cron 表达式' });
        }
        try {
            let schedule = database.getSchedules().find(s => s.name === 'Daily Inventory Update');
            if (schedule) {
                // 更新现有任务
                const updated = database.updateSchedule(schedule.id, { cron });
                this.stopScheduledTask(schedule.id);
                this.startScheduledTask(updated);
                res.json(updated);
            } else {
                // 创建新任务
                const newSchedule = database.saveSchedule({
                    name: 'Daily Inventory Update',
                    cron: cron,
                    configId: null, // 这个任务不与特定配置关联
                    userId: req.user.id, // 关联当前用户
                    isActive: 1
                });
                this.startScheduledTask(newSchedule);
                res.status(201).json(newSchedule);
            }
        } catch (error) {
            res.status(500).json({ error: '保存定时任务失败: ' + error.message });
        }
    });

    // 获取定时任务执行历史
    router.get('/schedule/history', (req, res) => {
        try {
            const history = database.getScheduledTaskHistory();
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: '获取定时任务历史失败: ' + error.message });
        }
    });

    // 手动触发一次分析
    router.post('/run-analysis', async (req, res) => {
        try {
            await analysisService.runInventoryAnalysis();
            res.json({ message: '库存分析任务已成功触发。' });
        } catch (error) {
            res.status(500).json({ error: '手动分析失败: ' + error.message });
        }
    });

    // 获取系统配置
    router.get('/system-configs', (req, res) => {
        try {
            const configs = database.getSystemConfigs();
            res.json(configs);
        } catch (error) {
            res.status(500).json({ error: '获取系统配置失败: ' + error.message });
        }
    });

    // 更新系统配置
    router.post('/system-configs', (req, res) => {
        try {
            database.updateSystemConfigs(req.body);
            res.json({ message: '系统配置已更新' });
        } catch (error) {
            res.status(500).json({ error: '更新系统配置失败: ' + error.message });
        }
    });

    // 获取活跃的预警
    router.get('/alerts', (req, res) => {
        try {
            const alerts = database.getActiveAlerts();
            res.json(alerts);
        } catch (error) {
            res.status(500).json({ error: '获取预警失败: ' + error.message });
        }
    });

    this.app.use('/api/inventory', auth.authenticateToken.bind(auth), router);
  }

  setupErrorHandling() {
    // 404处理
    this.app.use((req, res) => {
      res.status(404).json({ error: '页面不存在' });
    });

    // 错误处理
    this.app.use((error, req, res, next) => {
      console.error('服务器错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    });
  }

  async start() {
    try {
      // 初始化数据库
      //await database.init();

      // 启动定时任务
      await this.startAllScheduledTasks();

      // 启动服务器
      this.app.listen(this.port, () => {
        console.log(`服务器运行在 http://localhost:${this.port}`);
        console.log('默认管理员账户: admin / admin123');
      });
    } catch (error) {
      console.error('服务器启动失败:', error);
      process.exit(1);
    }
  }

  async stop() {
    // 停止所有定时任务
    for (const [scheduleId, task] of this.scheduledTasks) {
      task.stop();
      console.log(`定时任务已停止: ${scheduleId}`);
    }
    this.scheduledTasks.clear();

    // 关闭数据库连接
    if (database && database.close) {
      await database.close();
      console.log('数据库连接已关闭');
    }

    console.log('服务器已停止');
  }
}



module.exports = WebServer;
