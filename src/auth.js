const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
// const database = require('./database');
const database = require('./db_sqlite'); // 修改为 SQLite 数据库模块


const JWT_SECRET = process.env.JWT_SECRET || 'warehouse-detective-secret-key';

class AuthService {
  // 生成JWT令牌
  generateToken(user) {
    return jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
  }

  // 验证JWT令牌
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  // 用户登录
  async login(username, password) {
    const user =  database.findUserByUsername(username);
    if (!user || !user.isActive) {
      throw new Error('用户名或密码错误');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('用户名或密码错误');
    }

    const token = this.generateToken(user);
    const { password: _, ...userWithoutPassword } = user;
    
    return {
      user: userWithoutPassword,
      token
    };
  }

  // 用户注册
  async register(userData) {
    // 检查用户名是否已存在
    const existingUser =  database.findUserByUsername(userData.username);
    if (existingUser) {
      throw new Error('用户名已存在');
    }

    // 检查邮箱是否已存在
    const existingEmail = await database.findUserByEmail(userData.email);
    if (existingEmail) {
      throw new Error('邮箱已存在');
    }

    // 创建新用户
    const newUser =  database.createUser(userData);
    const token = this.generateToken(newUser);

    return {
      user: newUser,
      token
    };
  }

  // 验证用户身份中间件
  authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: '访问令牌缺失' });
    }

    const decoded = this.verifyToken(token);
    if (!decoded) {
      return res.status(403).json({ error: '无效的访问令牌' });
    }

    req.user = decoded;
    next();
  }

  // 验证管理员权限中间件
  requireAdmin(req, res, next) {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
  }

  // 验证超级管理员权限中间件
  requireSuperAdmin(req, res, next) {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: '需要超级管理员权限' });
    }
    next();
  }

  // 验证用户或管理员权限中间件
  requireUserOrAdmin(req, res, next) {
    const userId = parseInt(req.params.id);
    if (req.user.id !== userId && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  }
}

module.exports = new AuthService();
