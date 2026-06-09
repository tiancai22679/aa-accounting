const express = require('express');
const router = express.Router();
const { getDB, hashPassword, verifyPassword, generateToken } = require('../models/database');

/**
 * 注册
 * POST /api/auth/register
 * Body: { username, password, nickname }
 */
router.post('/register', (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    const db = getDB();

    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }

    if (password.length < 4) {
      return res.status(400).json({ code: 400, message: '密码至少4位' });
    }

    // 检查用户名是否已存在
    const existing = db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ code: 400, message: '用户名已存在' });
    }

    const passwordHash = hashPassword(password);
    const token = generateToken();

    const result = db.run(
      'INSERT INTO users (username, password_hash, nickname, session_token) VALUES (?, ?, ?, ?)',
      [username, passwordHash, nickname || username, token]
    );

    const user = db.get('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);

    res.json({
      code: 0,
      message: '注册成功',
      data: {
        token: user.session_token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatarUrl: user.avatar_url
        }
      }
    });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ code: 500, message: '注册失败：' + (err.message || '') });
  }
});

/**
 * 登录
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const db = getDB();

    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }

    const user = db.get('SELECT * FROM users WHERE username = ?', [username]);

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }

    // 生成新的 session token
    const token = generateToken();
    db.run('UPDATE users SET session_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [token, user.id]);

    res.json({
      code: 0,
      message: '登录成功',
      data: {
        token: token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatarUrl: user.avatar_url
        }
      }
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ code: 500, message: '登录失败：' + (err.message || '') });
  }
});

/**
 * 获取当前用户信息
 * GET /api/auth/profile
 */
router.get('/profile', require('../middleware/auth').authMiddleware, (req, res) => {
  res.json({
    code: 0,
    data: {
      id: req.user.id,
      username: req.user.username,
      nickname: req.user.nickname,
      avatarUrl: req.user.avatar_url
    }
  });
});

/**
 * 退出登录
 * POST /api/auth/logout
 */
router.post('/logout', require('../middleware/auth').authMiddleware, (req, res) => {
  try {
    const db = getDB();
    db.run('UPDATE users SET session_token = NULL WHERE id = ?', [req.user.id]);
    res.json({ code: 0, message: '已退出登录' });
  } catch (err) {
    console.error('退出失败:', err);
    res.status(500).json({ code: 500, message: '退出失败' });
  }
});

module.exports = router;
