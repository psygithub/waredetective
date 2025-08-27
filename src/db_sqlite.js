const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '../data/warehouse.db');
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
    scheduleData.cronExpression,
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
    updateData.cronExpression || schedule.cron,
    updateData.isActive !== undefined ? (updateData.isActive ? 1 : 0) : schedule.isActive,
    id
  );
  return getScheduleById(id);
}
function deleteSchedule(id) {
  const stmt = db.prepare('DELETE FROM schedules WHERE id = ?');
  return stmt.run(id).changes > 0;
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
  deleteSchedule
};