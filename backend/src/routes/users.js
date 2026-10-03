const express = require('express');
const router = express.Router();
const { getDB, hashPassword, verifyPassword } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

/**
 * 更新用户信息
 * PUT /api/users/profile
 */
router.put('/profile', (req, res) => {
  try {
    const { nickname, avatarUrl } = req.body;
    const db = getDB();

    if (nickname) {
      db.prepare(
        'UPDATE users SET nickname = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(nickname, avatarUrl || req.user.avatar_url, req.user.id);
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    res.json({
      code: 0,
      data: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatar_url
      }
    });
  } catch (err) {
    console.error('更新用户信息失败:', err);
    res.status(500).json({ code: 500, message: '更新失败' });
  }
});

/**
 * 搜索用户（用于添加成员）
 * GET /api/users/search?keyword=xxx
 */
router.get('/search', (req, res) => {
  try {
    const { keyword } = req.query;
    const db = getDB();

    if (!keyword || keyword.length < 1) {
      return res.json({ code: 0, data: [] });
    }

    const users = db.prepare(`
      SELECT id, nickname, avatar_url
      FROM users
      WHERE nickname LIKE ? AND id != ?
      LIMIT 20
    `).all(`%${keyword}%`, req.user.id);

    res.json({ code: 0, data: users });
  } catch (err) {
    console.error('搜索用户失败:', err);
    res.status(500).json({ code: 500, message: '搜索失败' });
  }
});

/**
 * 修改自己的密码
 * POST /api/users/change-password
 * Body: { oldPassword, newPassword }
 */
router.post('/change-password', (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    const db = getDB();

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ code: 400, message: '原密码和新密码都不能为空' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ code: 400, message: '新密码至少4位' });
    }

    // 校验原密码
    const user = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user || !verifyPassword(oldPassword, user.password_hash)) {
      return res.status(400).json({ code: 400, message: '原密码不正确' });
    }

    const newHash = hashPassword(newPassword);
    db.run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newHash, req.user.id]
    );
    try { db.save(); } catch (e) {}

    res.json({ code: 0, message: '密码修改成功' });
  } catch (err) {
    console.error('修改密码失败:', err);
    res.status(500).json({ code: 500, message: '修改密码失败' });
  }
});

module.exports = router;
