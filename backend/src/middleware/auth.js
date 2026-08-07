// src/middleware/auth.js
// 认证中间件：验证 session_token
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({ code: 401, message: '未登录，请先登录' });
    }

    // token 就是 session_token，查用户
    const { getDB } = require('../models/database');
    const db = getDB();
    const user = db.get('SELECT * FROM users WHERE session_token = ?', [token]);

    if (!user) {
      return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('认证失败:', err);
    res.status(500).json({ code: 500, message: '认证失败' });
  }
}

// 超级管理员中间件：需要先通过 authMiddleware，再检查 role
function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '无管理员权限' });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware };
