const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');
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

module.exports = router;
