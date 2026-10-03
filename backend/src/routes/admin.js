const express = require('express');
const router = express.Router();
const { getDB, hashPassword } = require('../models/database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const backup = require('../lib/backup');

// 所有 admin 路由都需要认证 + 管理员权限
router.use(authMiddleware, adminMiddleware);

// 默认密码 1234 的哈希值（用于重置密码 / 标记弱密码）
const DEFAULT_PASSWORD_HASH = hashPassword('1234');

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

/**
 * 获取备份配置（WebDAV）
 * GET /api/admin/backup/config
 */
router.get('/backup/config', (req, res) => {
  try {
    const cfg = backup.getConfig();
    res.json({
      code: 0,
      data: {
        enabled: cfg.enabled,
        url: cfg.url,
        username: cfg.username,
        remotePath: cfg.remotePath,
        hour: cfg.hour,
        lastBackupAt: cfg.lastBackupAt,
        lastBackupStatus: cfg.lastBackupStatus,
        hasPassword: !!cfg.password
      }
    });
  } catch (err) {
    console.error('获取备份配置失败:', err);
    res.status(500).json({ code: 500, message: '获取备份配置失败' });
  }
});

/**
 * 保存备份配置
 * POST /api/admin/backup/config
 */
router.post('/backup/config', (req, res) => {
  try {
    const { enabled, url, username, password, remotePath, hour } = req.body || {};
    const data = {};
    if (enabled !== undefined) data.enabled = !!enabled;
    if (url !== undefined) data.url = (url || '').trim();
    if (username !== undefined) data.username = (username || '').trim();
    if (remotePath !== undefined) data.remotePath = (remotePath || '').trim();
    if (hour !== undefined) data.hour = parseInt(hour, 10) || 2;
    if (password !== undefined) data.password = password; // 允许空字符串清除
    backup.saveConfig(data);
    res.json({ code: 0, message: '已保存备份配置' });
  } catch (err) {
    console.error('保存备份配置失败:', err);
    res.status(500).json({ code: 500, message: '保存备份配置失败' });
  }
});

/**
 * 立即执行一次备份
 * POST /api/admin/backup/now
 */
router.post('/backup/now', async (req, res) => {
  try {
    const result = await backup.performBackup(true);
    if (result.skipped) {
      return res.json({ code: 0, message: '未启用自动备份，但已尝试上传', data: result });
    }
    if (result.success) {
      return res.json({ code: 0, message: '备份成功', data: result });
    }
    return res.status(400).json({ code: 400, message: '备份失败: ' + (result.error || ''), data: result });
  } catch (err) {
    console.error('手动备份失败:', err);
    res.status(500).json({ code: 500, message: '备份失败: ' + err.message });
  }
});

/**
 * 获取所有用户（管理员）
 * GET /api/admin/users
 */
router.get('/users', (req, res) => {
  try {
    const db = getDB();
    const users = db.all(`
      SELECT id, username, nickname, role, avatar_url, created_at, password_hash,
        (SELECT COUNT(*) FROM group_members WHERE user_id = users.id) as group_count
      FROM users
      ORDER BY id ASC
    `);

    // 标记是否仍在使用默认密码，且绝不返回 password_hash
    const result = users.map(u => {
      const isDefaultPassword = u.password_hash === DEFAULT_PASSWORD_HASH;
      delete u.password_hash;
      return { ...u, isDefaultPassword };
    });

    res.json({ code: 0, data: result });
  } catch (err) {
    console.error('获取用户列表失败:', err);
    res.status(500).json({ code: 500, message: '获取用户列表失败' });
  }
});

/**
 * 重置用户密码为默认密码 1234（管理员）
 * POST /api/admin/users/:id/reset-password
 */
router.post('/users/:id/reset-password', (req, res) => {
  try {
    const db = getDB();
    const userId = parseInt(req.params.id, 10);
    const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }
    db.run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [DEFAULT_PASSWORD_HASH, userId]
    );
    try { db.save(); } catch (e) {}
    res.json({ code: 0, message: '已将密码重置为默认密码 1234' });
  } catch (err) {
    console.error('重置密码失败:', err);
    res.status(500).json({ code: 500, message: '重置密码失败' });
  }
});

/**
 * 删除用户（管理员）
 * DELETE /api/admin/users/:id
 * 会级联清理其成员关系、账单、结算记录，并将其创建的账本转交给当前管理员；
 * 禁止删除自己，禁止删除最后一个管理员（避免系统锁死）。
 */
router.delete('/users/:id', (req, res) => {
  try {
    const db = getDB();
    const userId = parseInt(req.params.id, 10);

    if (userId === req.user.id) {
      return res.status(400).json({ code: 400, message: '不能删除当前登录的管理员账号' });
    }

    const user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    // 防止删除最后一个管理员，避免系统锁死
    if (user.role === 'admin') {
      const adminCount = db.get("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'");
      if (adminCount.cnt <= 1) {
        return res.status(400).json({ code: 400, message: '不能删除最后一个管理员账号' });
      }
    }

    // 防止删除仍有"未结算账本"的用户：只要该用户是某个尚未全员结算账本的成员，就禁止删除
    const unsettled = db.get(`
      SELECT COUNT(*) as cnt FROM groups_table g
      WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = ?)
        AND (
          (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) = 0
          OR (SELECT COUNT(*) FROM group_members WHERE group_id = g.id AND is_settled = 1)
             < (SELECT COUNT(*) FROM group_members WHERE group_id = g.id)
        )
    `, [userId]);
    if (unsettled && unsettled.cnt > 0) {
      return res.status(400).json({ code: 400, message: '该用户仍有未结算的账本，请先完成结算后再删除' });
    }

    const deleteUserTransaction = db.transaction(function() {
      // 将其创建的账本转交给当前管理员，避免账本创建者悬空
      db.run('UPDATE groups_table SET created_by = ? WHERE created_by = ?', [req.user.id, userId]);
      // 删除其成员关系
      db.run('DELETE FROM group_members WHERE user_id = ?', [userId]);
      // 删除其相关的结算记录
      db.run('DELETE FROM settlements WHERE from_user_id = ? OR to_user_id = ?', [userId, userId]);
      // 删除其作为付款人/创建人的账单及其分摊
      const exp = db.all('SELECT id FROM expenses WHERE payer_id = ? OR creator_id = ?', [userId, userId]);
      if (exp.length > 0) {
        const ids = exp.map(e => e.id);
        db.run('DELETE FROM expense_splits WHERE expense_id IN (' + ids.join(',') + ')');
        db.run('DELETE FROM expenses WHERE id IN (' + ids.join(',') + ')');
      }
      // 最后删除用户
      db.run('DELETE FROM users WHERE id = ?', [userId]);
    });
    deleteUserTransaction();

    res.json({ code: 0, message: '用户已删除' });
  } catch (err) {
    console.error('删除用户失败:', err);
    res.status(500).json({ code: 500, message: '删除用户失败' });
  }
});

module.exports = router;
