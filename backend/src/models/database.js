const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'accounting.db');

let dbInstance = null;

/**
 * 封装 sql.js Database，提供类 sqlite3 的同步 API
 */
class Database {
  constructor(sqlDb) {
    this._db = sqlDb;
  }

  /**
   * 执行 SQL（无参数或带参数）
   */
  run(sql, params) {
    if (params === undefined) {
      // 无参数：直接 run
      this._db.run(sql);
    } else {
      // 有参数：prepare + bind + step
      const stmt = this._db.prepare(sql);
      stmt.bind(params);
      stmt.step();
      stmt.free();
    }
    return this._lastInsertResult();
  }

  _lastInsertResult() {
    try {
      const r = this._db.exec('SELECT last_insert_rowid() as id');
      if (r.length > 0 && r[0].values.length > 0) {
        return { lastInsertRowid: r[0].values[0][0], changes: this._db.getRowsModified() };
      }
      return { lastInsertRowid: null, changes: 0 };
    } catch (e) {
      return { lastInsertRowid: null, changes: 0 };
    }
  }

  get(sql, params) {
    const stmt = this._db.prepare(sql);
    stmt.bind(params || []);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }

  all(sql, params) {
    const stmt = this._db.prepare(sql);
    stmt.bind(params || []);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  exec(sql) {
    return this._db.exec(sql);
  }

  prepare(sql) {
    const stmt = this._db.prepare(sql);
    const self = this;
    // 将参数统一转为数组：支持 array 或 variadic args 两种调用方式
    const toArray = (args) => {
      if (args.length === 0) return [];
      if (args.length === 1 && Array.isArray(args[0])) return args[0];
      return args;
    };
    return {
      _stmt: stmt,
      get(...args) {
        stmt.reset();
        stmt.bind(toArray(args));
        if (stmt.step()) return stmt.getAsObject();
        return null;
      },
      all(...args) {
        stmt.reset();
        stmt.bind(toArray(args));
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      },
      run(...args) {
        stmt.reset();
        stmt.bind(toArray(args));
        stmt.step();
        const r = self._db.exec('SELECT last_insert_rowid() as id');
        const id = r.length > 0 && r[0].values.length > 0 ? r[0].values[0][0] : null;
        return { lastInsertRowid: id };
      },
      free() { stmt.free(); }
    };
  }

  transaction(fn) {
    const self = this;
    return function(...args) {
      self._db.run('BEGIN');
      try {
        const result = fn.apply(this, args);
        self._db.run('COMMIT');
        return result;
      } catch (e) {
        self._db.run('ROLLBACK');
        throw e;
      }
    };
  }

  save() {
    const data = this._db.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, buffer);
  }

  close() {
    this._db.close();
  }
}

/**
 * 密码哈希（SHA-256，开发环境用，生产环境建议 bcrypt）
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * 验证密码
 */
function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

/**
 * 生成会话 token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function initDB() {
  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(buf);
  } else {
    sqlDb = new SQL.Database();
  }

  dbInstance = new Database(sqlDb);

  // 建表（无参数，直接 run）
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      nickname TEXT NOT NULL DEFAULT '用户',
      avatar_url TEXT DEFAULT '',
      openid TEXT,
      session_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS groups_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      created_by INTEGER NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '💰',
      type TEXT DEFAULT 'expense'
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      payer_id INTEGER NOT NULL,
      creator_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      category_id INTEGER DEFAULT 1,
      description TEXT DEFAULT '',
      expense_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      share_amount REAL NOT NULL,
      is_settled INTEGER DEFAULT 0,
      settled_at DATETIME,
      UNIQUE(expense_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      note TEXT DEFAULT '',
      settled_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of tables) {
    dbInstance.run(sql); // 无参数
  }

  // 迁移：给已有表添加新列（如果不存在）
  try {
    dbInstance.run('ALTER TABLE users ADD COLUMN username TEXT UNIQUE');
  } catch (e) {}
  try {
    dbInstance.run('ALTER TABLE users ADD COLUMN password_hash TEXT');
  } catch (e) {}
  try {
    dbInstance.run('ALTER TABLE users ADD COLUMN session_token TEXT');
  } catch (e) {}
  try {
    dbInstance.run('ALTER TABLE expenses ADD COLUMN creator_id INTEGER');
  } catch (e) {}
  // 迁移：旧数据 creator_id 为空时填补为 payer_id
  try {
    dbInstance.run('UPDATE expenses SET creator_id = payer_id WHERE creator_id IS NULL');
  } catch (e) {}
  // 迁移：group_members 加成员结算状态字段
  try {
    dbInstance.run('ALTER TABLE group_members ADD COLUMN is_settled INTEGER DEFAULT 0');
  } catch (e) {}
  try {
    dbInstance.run('ALTER TABLE group_members ADD COLUMN settled_at DATETIME');
  } catch (e) {}

  // 初始化默认类别
  const countRow = dbInstance.get('SELECT COUNT(*) as cnt FROM categories');
  if (countRow.cnt === 0) {
    const insertCat = dbInstance.prepare('INSERT INTO categories (name, icon, type) VALUES (?, ?, ?)');
    const cats = [
      ['餐饮', '🍽️', 'expense'],
      ['交通', '🚗', 'expense'],
      ['住宿', '🏨', 'expense'],
      ['购物', '🛒', 'expense'],
      ['娱乐', '🎮', 'expense'],
      ['通讯', '📱', 'expense'],
      ['医疗', '💊', 'expense'],
      ['学习', '📚', 'expense'],
      ['礼物', '🎁', 'expense'],
      ['日用', '💡', 'expense'],
      ['旅行', '✈️', 'expense'],
      ['其他', '🔧', 'expense'],
      ['收入', '💰', 'income']
    ];
    for (const c of cats) {
      insertCat.run(c);
    }
    insertCat.free();
  }

  // 自动保存
  setInterval(() => { try { dbInstance.save(); } catch (e) {} }, 30000);
  process.on('exit', () => { try { dbInstance.save(); } catch (e) {} });
  process.on('SIGINT', () => { try { dbInstance.save(); } catch (e) {}; process.exit(); });

  console.log('✅ 数据库初始化完成');
  return dbInstance;
}

function getDB() {
  if (!dbInstance) throw new Error('数据库未初始化，请先调用 initDB()');
  return dbInstance;
}

module.exports = { initDB, getDB, hashPassword, verifyPassword, generateToken };
