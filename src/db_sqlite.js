const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// 确保数据目录存在
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('已创建数据目录:', dataDir);
}

const dbPath = path.join(dataDir, 'warehouse.db');
const db = new Database(dbPath);

// 初始化表结构
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  email TEXT,
  password TEXT,
  role TEXT,
  createdAt TEXT,
  isActive INTEGER
);

CREATE TABLE IF NOT EXISTS configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  skus TEXT,
  regions TEXT,
  description TEXT,
  userId INTEGER,
  createdAt TEXT
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER,
  configId INTEGER,
  skus TEXT,
  regions TEXT,
  results TEXT,
  status TEXT,
  isScheduled INTEGER,
  scheduleId INTEGER,
  createdAt TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  cron TEXT,
  configId INTEGER,
  userId INTEGER,
  isActive INTEGER,
  createdAt TEXT
);
-- 创建商品信息表（单表存储所有信息）
CREATE TABLE IF NOT EXISTS xizhiyue_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- 基础信息
    product_sku_id INTEGER UNIQUE NOT NULL,
    product_id INTEGER NOT NULL,
    product_sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    product_image TEXT,
    
    -- 销售信息
    month_sales INTEGER DEFAULT 0,
    product_price TEXT,
    is_hot_sale INTEGER DEFAULT 0,
    is_new INTEGER DEFAULT 0,
    is_seckill INTEGER DEFAULT 0,
    is_wish INTEGER DEFAULT 0,
    
    -- 库存状态（针对请求的地区）
    target_region_id INTEGER NOT NULL,
    target_region_name TEXT,
    target_region_code TEXT,
    target_quantity INTEGER DEFAULT 0,
    target_price TEXT,
    target_stock_status TEXT,
    
    -- 所有地区库存信息（JSON格式存储）
    all_regions_inventory TEXT,
    
    -- 其他信息（JSON格式存储）
    product_certificate TEXT, -- 证书信息
    product_categories TEXT,  -- 分类信息
    product_attributes TEXT,  -- 属性信息
    formatted_attributes TEXT, -- 格式化属性
    delivery_regions TEXT,    -- 所有地区配送信息
    
    -- 价格信息
    member_price REAL,
    price_currency TEXT,
    price_currency_symbol TEXT,
    base_price REAL,
    guide_price REAL,
    real_price TEXT,
    
    -- 时间信息
    product_addtime TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    
);
-- 创建索引（移到表创建语句之外）
CREATE INDEX IF NOT EXISTS idx_product_sku ON xizhiyue_products (product_sku);
CREATE INDEX IF NOT EXISTS idx_sku_id ON xizhiyue_products (product_sku_id);
CREATE INDEX IF NOT EXISTS idx_region ON xizhiyue_products (target_region_id);
CREATE INDEX IF NOT EXISTS idx_hot_sale ON xizhiyue_products (is_hot_sale);
CREATE INDEX IF NOT EXISTS idx_created_at ON xizhiyue_products (created_at);

-- 创建商品历史价格表（可选，用于跟踪价格变化）
CREATE TABLE IF NOT EXISTS xizhiyue_price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_sku_id INTEGER NOT NULL,
    region_id INTEGER NOT NULL,
    price TEXT,
    quantity INTEGER,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// 自动插入默认管理员
function ensureDefaultAdmin() {
  const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, email, password, role, createdAt, isActive)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'admin',
      'admin@warehouse.com',
      hash,
      'admin',
      new Date().toISOString(),
      1
    );
    console.log('已创建默认管理员账户: admin / admin123');
  }
}

ensureDefaultAdmin();

// 用户相关
function getAllUsers() {
  return db.prepare('SELECT * FROM users').all();
}
function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}
function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}
function createUser(userData) {
  const stmt = db.prepare(`
    INSERT INTO users (username, email, password, role, createdAt, isActive)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    userData.username,
    userData.email,
    userData.password,
    userData.role || 'user',
    new Date().toISOString(),
    1
  );
  return findUserById(info.lastInsertRowid);
}
function updateUser(id, updateData) {
  const user = findUserById(id);
  if (!user) return null;
  const stmt = db.prepare(`
    UPDATE users SET username = ?, email = ?, password = ?, role = ?, isActive = ?
    WHERE id = ?
  `);
  stmt.run(
    updateData.username || user.username,
    updateData.email || user.email,
    updateData.password || user.password,
    updateData.role || user.role,
    updateData.isActive !== undefined ? updateData.isActive : user.isActive,
    id
  );
  return findUserById(id);
}
function deleteUser(id) {
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  return stmt.run(id).changes > 0;
}

// 配置相关
function saveConfig(configData) {
  const stmt = db.prepare(`
    INSERT INTO configs (name, skus, regions, description, userId, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    configData.name,
    JSON.stringify(configData.skus),
    JSON.stringify(configData.regions),
    configData.description || '',
    configData.userId,
    new Date().toISOString()
  );
  return getConfigById(info.lastInsertRowid);
}
function getConfigs() {
  return db.prepare('SELECT * FROM configs').all();
}
function getConfigById(id) {
  const config = db.prepare('SELECT * FROM configs WHERE id = ?').get(id);
  if (!config) return null;
  return {
    ...config,
    skus: JSON.parse(config.skus),
    regions: JSON.parse(config.regions)
  };
}
function updateConfig(id, updateData) {
  const config = getConfigById(id);
  if (!config) return null;
  const stmt = db.prepare(`
    UPDATE configs SET name = ?, skus = ?, regions = ?, description = ?
    WHERE id = ?
  `);
  stmt.run(
    updateData.name || config.name,
    JSON.stringify(updateData.skus || config.skus),
    JSON.stringify(updateData.regions || config.regions),
    updateData.description || config.description,
    id
  );
  return getConfigById(id);
}
function deleteConfig(id) {
  const stmt = db.prepare('DELETE FROM configs WHERE id = ?');
  return stmt.run(id).changes > 0;
}


// 结果相关
function saveResult(resultData) {
  const stmt = db.prepare(`
    INSERT INTO results (userId, configId, skus, regions, results, status, isScheduled, scheduleId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    resultData.userId,
    resultData.configId,
    JSON.stringify(resultData.skus),
    JSON.stringify(resultData.regions),
    JSON.stringify(resultData.results),
    resultData.status,
    resultData.isScheduled ? 1 : 0,
    resultData.scheduleId,
    new Date().toISOString(),
    new Date().toISOString()
  );
  return getResultById(info.lastInsertRowid);
}
function getResults(limit = 100, offset = 0) {
  return db.prepare('SELECT * FROM results ORDER BY createdAt DESC LIMIT ? OFFSET ?').all(limit, offset)
    .map(r => ({
      ...r,
      skus: JSON.parse(r.skus),
      regions: JSON.parse(r.regions),
      results: JSON.parse(r.results)
    }));
}
function getResultById(id) {
  const r = db.prepare('SELECT * FROM results WHERE id = ?').get(id);
  if (!r) return null;
  return {
    ...r,
    skus: JSON.parse(r.skus),
    regions: JSON.parse(r.regions),
    results: JSON.parse(r.results)
  };
}

// 调度相关
function saveSchedule(scheduleData) {
  const stmt = db.prepare(`
    INSERT INTO schedules (name, cron, configId, userId, isActive, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    scheduleData.name,
    scheduleData.cron,
    scheduleData.configId,
    scheduleData.userId,
    scheduleData.isActive ? 1 : 0,
    new Date().toISOString()
  );
  return getScheduleById(info.lastInsertRowid);
}
function getSchedules() {
  return db.prepare('SELECT * FROM schedules').all();
}
function getScheduleById(id) {
  return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
}
function updateSchedule(id, updateData) {
  const schedule = getScheduleById(id);
  if (!schedule) return null;
  const stmt = db.prepare(`
    UPDATE schedules SET name = ?, cron = ?, isActive = ?
    WHERE id = ?
  `);
  stmt.run(
    updateData.name || schedule.name,
    updateData.cron|| schedule.cron,
    updateData.isActive !== undefined ? (updateData.isActive ? 1 : 0) : schedule.isActive,
    id
  );
  return getScheduleById(id);
}
function deleteSchedule(id) {
  const stmt = db.prepare('DELETE FROM schedules WHERE id = ?');
  return stmt.run(id).changes > 0;
}

// 获取商品信息
function getXizhiyueProductBySkuId(skuId) {
  const stmt = this.db.prepare('SELECT * FROM xizhiyue_products WHERE product_sku_id = ?');
  return stmt.get(skuId);
}

// 创建商品
function createXizhiyueProduct(productData) {
  const stmt = this.db.prepare(`
    INSERT INTO xizhiyue_products 
    (product_sku_id, product_id, product_sku, product_name, product_image, 
     month_sales, product_price, is_hot_sale, is_new, is_seckill, is_wish,
     target_region_id, target_region_name, target_region_code, target_quantity, 
     target_price, target_stock_status, all_regions_inventory, product_certificate, 
     product_categories, product_attributes, formatted_attributes, delivery_regions,
     member_price, price_currency, price_currency_symbol, base_price, guide_price, 
     real_price, product_addtime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  return stmt.run(
    productData.product_sku_id,
    productData.product_id,
    productData.product_sku,
    productData.product_name,
    productData.product_image,
    productData.month_sales,
    productData.product_price,
    productData.is_hot_sale,
    productData.is_new,
    productData.is_seckill,
    productData.is_wish,
    productData.target_region_id,
    productData.target_region_name,
    productData.target_region_code,
    productData.target_quantity,
    productData.target_price,
    productData.target_stock_status,
    productData.all_regions_inventory,
    productData.product_certificate,
    productData.product_categories,
    productData.product_attributes,
    productData.formatted_attributes,
    productData.delivery_regions,
    productData.member_price,
    productData.price_currency,
    productData.price_currency_symbol,
    productData.base_price,
    productData.guide_price,
    productData.real_price,
    productData.product_addtime
  );
}

// 更新商品
function updateXizhiyueProduct(skuId, productData) {
  const stmt = this.db.prepare(`
    UPDATE xizhiyue_products 
    SET product_name = ?, product_image = ?, month_sales = ?, product_price = ?, 
        is_hot_sale = ?, is_new = ?, is_seckill = ?, is_wish = ?,
        target_region_id = ?, target_region_name = ?, target_region_code = ?, 
        target_quantity = ?, target_price = ?, target_stock_status = ?,
        all_regions_inventory = ?, product_certificate = ?, product_categories = ?, 
        product_attributes = ?, formatted_attributes = ?, delivery_regions = ?,
        member_price = ?, price_currency = ?, price_currency_symbol = ?, 
        base_price = ?, guide_price = ?, real_price = ?, product_addtime = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE product_sku_id = ?
  `);
  
  return stmt.run(
    productData.product_name,
    productData.product_image,
    productData.month_sales,
    productData.product_price,
    productData.is_hot_sale,
    productData.is_new,
    productData.is_seckill,
    productData.is_wish,
    productData.target_region_id,
    productData.target_region_name,
    productData.target_region_code,
    productData.target_quantity,
    productData.target_price,
    productData.target_stock_status,
    productData.all_regions_inventory,
    productData.product_certificate,
    productData.product_categories,
    productData.product_attributes,
    productData.formatted_attributes,
    productData.delivery_regions,
    productData.member_price,
    productData.price_currency,
    productData.price_currency_symbol,
    productData.base_price,
    productData.guide_price,
    productData.real_price,
    productData.product_addtime,
    skuId
  );
}


module.exports = {
  getAllUsers,
  findUserById,
  findUserByUsername,
  createUser,
  updateUser,
  deleteUser,
  saveConfig,
  getConfigs,
  getConfigById,
  updateConfig,
  deleteConfig,
  saveResult,
  getResults,
  getResultById,
  saveSchedule,
  getSchedules,
  getScheduleById,
  updateSchedule,
  deleteSchedule,
  getXizhiyueProductBySkuId,
  updateXizhiyueProduct,
  createXizhiyueProduct
};