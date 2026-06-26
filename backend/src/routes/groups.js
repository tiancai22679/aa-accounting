const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

/**
 * 创建账本
 * POST /api/groups
 * Body: { name, description }
 */
router.post('/', (req, res) => {
  try {
    const { name, description } = req.body;
    const db = getDB();

    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '账本名称不能为空' });
    }

    // 生成唯一邀请码
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const result = db.run(
      'INSERT INTO groups_table (name, description, created_by, invite_code) VALUES (?, ?, ?, ?)',
      [name.trim(), description || '', req.user.id, inviteCode]
    );

    // 创建者自动加入账本
    db.run(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
      [result.lastInsertRowid, req.user.id, 'owner']
    );

    const group = db.get('SELECT * FROM groups_table WHERE id = ?', [result.lastInsertRowid]);

    res.json({
      code: 0,
      message: '创建成功',
      data: group
    });
  } catch (err) {
    console.error('创建账本失败:', err);
    res.status(500).json({ code: 500, message: '创建账本失败' });
  }
});

/**
 * 获取我的账本列表
 * GET /api/groups
 */
router.get('/', (req, res) => {
  try {
    const db = getDB();

    const groups = db.all(`
      SELECT g.*,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id AND is_settled = 1) as settled_count,
        u.nickname as creator_name
      FROM groups_table g
      INNER JOIN group_members gm ON g.id = gm.group_id AND gm.user_id = ?
      LEFT JOIN users u ON g.created_by = u.id
      ORDER BY g.updated_at DESC
    `, [req.user.id]);

    res.json({ code: 0, data: groups });
  } catch (err) {
    console.error('获取账本列表失败:', err);
    res.status(500).json({ code: 500, message: '获取账本列表失败' });
  }
});

/**
 * 获取账本详情
 * GET /api/groups/:id
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDB();
    const groupId = req.params.id;

    // 验证成员身份
    const membership = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );
    if (!membership) {
      return res.status(403).json({ code: 403, message: '你不是该账本成员' });
    }

    const group = db.get(`
      SELECT g.*, u.nickname as creator_name, u.avatar_url as creator_avatar
      FROM groups_table g
      LEFT JOIN users u ON g.created_by = u.id
      WHERE g.id = ?
    `, [groupId]);

    const members = db.all(`
      SELECT gm.*, u.nickname, u.avatar_url
      FROM group_members gm
      LEFT JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY gm.role DESC, gm.joined_at ASC
    `, [groupId]);

    // 账本总支出统计
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
    console.error('获取账本详情失败:', err);
    res.status(500).json({ code: 500, message: '获取账本详情失败' });
  }
});

/**
 * 编辑账本名称（仅创建人）
 * PUT /api/groups/:id
 * Body: { name }
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDB();
    const groupId = req.params.id;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ code: 400, message: '账本名称不能为空' });
    }

    // 验证创建人身份
    const group = db.get('SELECT * FROM groups_table WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({ code: 404, message: '账本不存在' });
    }
    if (group.created_by !== req.user.id) {
      return res.status(403).json({ code: 403, message: '仅创建人可编辑账本名称' });
    }

    db.run(
      'UPDATE groups_table SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name.trim(), groupId]
    );

    res.json({ code: 0, message: '修改成功' });
  } catch (err) {
    console.error('编辑账本失败:', err);
    res.status(500).json({ code: 500, message: '编辑账本失败' });
  }
});

/**
 * 通过邀请码加入账本
 * POST /api/groups/join
 * Body: { inviteCode }
 */
router.post('/join', (req, res) => {
  try {
    const { inviteCode } = req.body;
    const db = getDB();

    if (!inviteCode) {
      return res.status(400).json({ code: 400, message: '请输入邀请码' });
    }

    const group = db.get(
      'SELECT * FROM groups_table WHERE invite_code = ?',
      [inviteCode.toUpperCase()]
    );

    if (!group) {
      return res.status(404).json({ code: 404, message: '邀请码无效' });
    }

    // 检查是否已是成员
    const existing = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [group.id, req.user.id]
    );

    if (existing) {
      return res.status(400).json({ code: 400, message: '你已是该账本成员' });
    }

    // 加入账本
    db.run(
      'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
      [group.id, req.user.id]
    );

    res.json({
      code: 0,
      message: '加入成功',
      data: group
    });
  } catch (err) {
    console.error('加入账本失败:', err);
    res.status(500).json({ code: 500, message: '加入账本失败' });
  }
});

/**
 * 移除成员（仅创建人可用）
 * DELETE /api/groups/:id/members/:userId
 */
router.delete('/:id/members/:userId', (req, res) => {
  try {
    const db = getDB();
    const { id: groupId, userId } = req.params;

    // 验证创建人身份
    const membership = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );

    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ code: 403, message: '仅创建人可移除成员' });
    }

    if (Number(userId) === req.user.id) {
      return res.status(400).json({ code: 400, message: '不能移除自己' });
    }

    db.run(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );

    res.json({ code: 0, message: '移除成功' });
  } catch (err) {
    console.error('移除成员失败:', err);
    res.status(500).json({ code: 500, message: '移除成员失败' });
  }
});

/**
 * 退出账本
 * POST /api/groups/:id/leave
 */
router.post('/:id/leave', (req, res) => {
  try {
    const db = getDB();
    const groupId = req.params.id;

    const membership = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );

    if (!membership) {
      return res.status(400).json({ code: 400, message: '你不是该账本成员' });
    }

    if (membership.role === 'owner') {
      return res.status(400).json({ code: 400, message: '创建人不能退出，请先转让或解散账本' });
    }

    db.run(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );

    res.json({ code: 0, message: '退出成功' });
  } catch (err) {
    console.error('退出账本失败:', err);
    res.status(500).json({ code: 500, message: '退出账本失败' });
  }
});

/**
 * 标记成员已结算（仅创建人）
 * POST /api/groups/:id/members/:userId/settle
 * Body: { settled: true/false }
 */
router.post('/:id/members/:userId/settle', (req, res) => {
  try {
    const db = getDB();
    const { id: groupId, userId } = req.params;
    const { settled = true } = req.body;

    // 验证操作人身份（仅创建人可标记）
    const membership = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ? AND role = ?',
      [groupId, req.user.id, 'owner']
    );
    if (!membership) {
      return res.status(403).json({ code: 403, message: '仅创建人可标记结算状态' });
    }

    // 不能操作自己（创建人自己的结算状态随全局走）
    // 验证目标成员在此账本中
    const targetMember = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    if (!targetMember) {
      return res.status(404).json({ code: 404, message: '该成员不在此账本中' });
    }

    db.run(
      'UPDATE group_members SET is_settled = ?, settled_at = ? WHERE group_id = ? AND user_id = ?',
      [settled ? 1 : 0, settled ? new Date().toISOString() : null, groupId, userId]
    );

    res.json({ code: 0, message: settled ? '已标记为结算完成' : '已取消结算标记' });
  } catch (err) {
    console.error('标记结算失败:', err);
    res.status(500).json({ code: 500, message: '标记结算失败' });
  }
});

/**
 * 解散账本（仅创建人）
 * DELETE /api/groups/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDB();
    const groupId = req.params.id;

    // 验证创建人身份
    const membership = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ? AND role = ?',
      [groupId, req.user.id, 'owner']
    );

    if (!membership) {
      return res.status(403).json({ code: 403, message: '仅创建人可解散账本' });
    }

    // 使用事务同时删除所有相关数据，避免孤立数据
    const deleteGroupTransaction = db.transaction(function() {
      // 1. 删除账单分摊记录
      db.run(`
        DELETE FROM expense_splits
        WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = ?)
      `, [groupId]);

      // 2. 删除账单记录
      db.run('DELETE FROM expenses WHERE group_id = ?', [groupId]);

      // 3. 删除结算记录
      db.run('DELETE FROM settlements WHERE group_id = ?', [groupId]);

      // 4. 删除成员记录
      db.run('DELETE FROM group_members WHERE group_id = ?', [groupId]);

      // 5. 删除账本记录
      db.run('DELETE FROM groups_table WHERE id = ?', [groupId]);
    });

    deleteGroupTransaction();

    res.json({ code: 0, message: '账本已解散' });
  } catch (err) {
    console.error('解散账本失败:', err);
    res.status(500).json({ code: 500, message: '解散账本失败' });
  }
});

module.exports = router;
