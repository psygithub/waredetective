const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');

// const database = require('./database');
const database = require('./db_sqlite');

const auth = require('./auth');
const WarehouseDetective = require('./main');

class WebServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.scheduledTasks = new Map();
    this.isGlobalTaskRunning = false; // 全局任务运行状态
    this.currentTaskUser = null; // 当前执行任务的用户
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // 安全中间件
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
          fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"]
        }
      }
    }));
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true
    }));

    // 限流中间件
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15分钟
      max: 100 // 限制每个IP 15分钟内最多100个请求
    });
    this.app.use(limiter);

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
  }

  setupUserRoutes() {
    // 获取所有用户（仅超级管理员）
    this.app.get('/api/users',
      auth.authenticateToken.bind(auth),
      auth.requireSuperAdmin.bind(auth),
      (req, res) => {
        try {
          const users = database.getAllUsers();
          res.json(users);
        } catch (error) {
          res.status(500).json({ error: error.message });
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

          // 普通用户不能修改角色
          if (req.user.role !== 'super_admin') {
            delete updateData.role;
          }

          const updatedUser = database.updateUser(userId, updateData);
          if (!updatedUser) {
            return res.status(404).json({ error: '用户不存在' });
          }

          res.json(updatedUser);
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // 删除用户（仅超级管理员）
    this.app.delete('/api/users/:id',
      auth.authenticateToken.bind(auth),
      auth.requireSuperAdmin.bind(auth),
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
          } catch (error){
            console.error('任务执行保存数据失败:', error);
          }finally {
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
          const { name, cronExpression, configId, isActive = true } = req.body;

          if (!cron.validate(cronExpression)) {
            return res.status(400).json({ error: '无效的cron表达式' });
          }

          const scheduleData = {
            name,
            cronExpression,
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

          if (updateData.cronExpression && !cron.validate(updateData.cronExpression)) {
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

  // 执行仓库检测任务
  async executeTask(skus, regions) {
    let detective = null;
    try {
        detective = new WarehouseDetective();
        await detective.init();

        const loginSuccess = await detective.login();
        if (!loginSuccess) {
            throw new Error('登录失败');
        }

        const skuList = Array.isArray(skus) ? skus : [skus];
        const regionList = Array.isArray(regions) ? regions : [regions];

        // 使用 searchSkuList 而不是 run 方法，避免重复初始化
        const results = await detective.searchSkuList(skuList, regionList);
        
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
    const cronExpression = schedule.cronExpression || schedule.cron;
    
    if (!cron.validate(cronExpression)) {
        console.error(`无效的cron表达式: ${cronExpression} (任务ID: ${schedule.id})`);
        return;
    }

    const task = cron.schedule(cronExpression, async () => {
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
