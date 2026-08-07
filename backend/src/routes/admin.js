const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// 所有 admin 路由都需要认证 + 管理员权限
router.use(authMiddleware, adminMiddleware);

/**
 * 获取所有账本（管理员）
 * GET /api/admin/groups
 */
router.get('/groups', (req, res) => {
  try {
    const db = getDB();

    const groups = db.all(`
      SELECT g.*,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id AND is_settled = 1) as settled_count,
        (SELECT COUNT(*) FROM expenses WHERE group_id = g.id) as expense_count,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE group_id = g.id) as total_amount,
        u.nickname as creator_name,
        u.username as creator_username
      FROM groups_table g
      LEFT JOIN users u ON g.created_by = u.id
      ORDER BY g.updated_at DESC
    `);

    // 计算每个账本是否已全部结算
    const result = groups.map(g => ({
      ...g,
      is_fully_settled: g.member_count > 0 && g.settled_count >= g.member_count
    }));

    res.json({ code: 0, data: result });
  } catch (err) {
    console.error('管理员获取账本列表失败:', err);
    res.status(500).json({ code: 500, message: '获取账本列表失败' });
  }
});

/**
 * 获取任意账本详情（管理员，只读）
 * GET /api/admin/groups/:id
 */
router.get('/groups/:id', (req, res) => {
  try {
    const db = getDB();
    const groupId = req.params.id;

    const group = db.get(`
      SELECT g.*, u.nickname as creator_name, u.avatar_url as creator_avatar
      FROM groups_table g
      LEFT JOIN users u ON g.created_by = u.id
      WHERE g.id = ?
    `, [groupId]);

    if (!group) {
      return res.status(404).json({ code: 404, message: '账本不存在' });
    }

    const members = db.all(`
      SELECT gm.*, u.nickname, u.avatar_url, u.username
      FROM group_members gm
      LEFT JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY gm.role DESC, gm.joined_at ASC
    `, [groupId]);

    const stats = db.get(`
      SELECT
        COUNT(*) as expense_count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM expenses
      WHERE group_id = ?
    `, [groupId]);

    res.json({
      code: 0,
      data: { ...group, members, stats }
    });
  } catch (err) {
    console.error('管理员获取账本详情失败:', err);
    res.status(500).json({ code: 500, message: '获取账本详情失败' });
  }
});

/**
 * 删除已结算完成的账本（管理员，仅限全员已结算的账本）
 * DELETE /api/admin/groups/:id
 */
router.delete('/groups/:id', (req, res) => {
  try {
    const db = getDB();
    const groupId = req.params.id;

    // 验证账本存在
    const group = db.get('SELECT * FROM groups_table WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ code: 404, message: '账本不存在' });
    }

    // 检查是否全部成员已结算
    const memberCount = db.get(
      'SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ?',
      [groupId]
    );
    const settledCount = db.get(
      'SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND is_settled = 1',
      [groupId]
    );

    if (memberCount.cnt === 0) {
      return res.status(400).json({ code: 400, message: '账本无成员，无法判断结算状态' });
    }

    if (settledCount.cnt < memberCount.cnt) {
      return res.status(400).json({
        code: 400,
        message: '该账本尚未全部结算（' + settledCount.cnt + '/' + memberCount.cnt + '），无法删除'
      });
    }

    // 使用事务同时删除所有相关数据
    const deleteGroupTransaction = db.transaction(function() {
      db.run(`
        DELETE FROM expense_splits
        WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = ?)
      `, [groupId]);
      db.run('DELETE FROM expenses WHERE group_id = ?', [groupId]);
      db.run('DELETE FROM settlements WHERE group_id = ?', [groupId]);
      db.run('DELETE FROM group_members WHERE group_id = ?', [groupId]);
      db.run('DELETE FROM groups_table WHERE id = ?', [groupId]);
    });

    deleteGroupTransaction();

    res.json({ code: 0, message: '已结算账本已清理' });
  } catch (err) {
    console.error('管理员删除账本失败:', err);
    res.status(500).json({ code: 500, message: '删除账本失败' });
  }
});

module.exports = router;
