const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

// 分类名称映射（与前端 _getCategories 保持一致）
const CATEGORIES = [
  { id: 1, name: '餐饮' }, { id: 2, name: '交通' },
  { id: 3, name: '住宿' }, { id: 4, name: '购物' },
  { id: 5, name: '娱乐' }, { id: 6, name: '通讯' },
  { id: 7, name: '医疗' }, { id: 8, name: '学习' },
  { id: 9, name: '礼物' }, { id: 10, name: '日用' },
  { id: 11, name: '旅行' }, { id: 12, name: '其他' },
];

function getDefaultDescription(categoryId) {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  return (cat ? cat.name : '其他') + '费用';
}

// 判断描述是否为自动生成的默认描述（任意分类名+"费用"）
function isDefaultDescription(desc) {
  if (!desc) return true;
  return CATEGORIES.some(c => desc === c.name + '费用');
}

router.use(authMiddleware);

/**
 * 获取类别列表
 * GET /api/expenses/categories/all
 */
router.get('/categories/all', (req, res) => {
  try {
    const db = getDB();
    const categories = db.all('SELECT * FROM categories ORDER BY id');
    res.json({ code: 0, data: categories });
  } catch (err) {
    console.error('获取类别失败:', err);
    res.status(500).json({ code: 500, message: '获取类别失败' });
  }
});

/**
 * 添加账单
 * POST /api/expenses
 */
router.post('/', (req, res) => {
  try {
    const { groupId, amount, categoryId, description, expenseDate, splits } = req.body;
    const db = getDB();

    // 验证群组成员身份
    const membership = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );
    if (!membership) {
      return res.status(403).json({ code: 403, message: '你不是该账本成员' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ code: 400, message: '金额必须大于0' });
    }

    if (!splits || splits.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择分摊成员' });
    }

    // 验证分摊总额
    const totalShare = splits.reduce((sum, s) => sum + (s.shareAmount || 0), 0);
    if (Math.abs(totalShare - amount) > 0.01) {
      return res.status(400).json({ code: 400, message: `分摊金额(${totalShare})与总金额(${amount})不一致` });
    }

    // 插入账单
    const finalDescription = (!description || isDefaultDescription(description)) ? getDefaultDescription(categoryId || 1) : description;
    db.run('BEGIN');
    try {
      const result = db.run(
        `INSERT INTO expenses (group_id, payer_id, creator_id, amount, category_id, description, expense_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [groupId, req.user.id, req.user.id, amount, categoryId || 1, finalDescription, expenseDate || new Date().toISOString().split('T')[0]]
      );
      const expenseId = result.lastInsertRowid;

      // 插入分摊记录
      for (const split of splits) {
        db.run(
          'INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (?, ?, ?)',
          [expenseId, split.userId, split.shareAmount]
        );
      }

      // 更新群组时间
      db.run('UPDATE groups_table SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [groupId]);
      db.run('COMMIT');

      const expense = db.get(`
        SELECT e.*, u.nickname as payer_name, u.avatar_url as payer_avatar,
          c.name as category_name, c.icon as category_icon
        FROM expenses e
        LEFT JOIN users u ON e.payer_id = u.id
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE e.id = ?
      `, [expenseId]);

      const detailSplits = db.all(`
        SELECT es.*, u.nickname, u.avatar_url
        FROM expense_splits es
        LEFT JOIN users u ON es.user_id = u.id
        WHERE es.expense_id = ?
      `, [expenseId]);

      res.json({
        code: 0,
        message: '记账成功',
        data: { ...expense, splits: detailSplits }
      });
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  } catch (err) {
    console.error('添加账单失败:', err);
    res.status(500).json({ code: 500, message: '添加账单失败: ' + (err.message || '') });
  }
});

/**
 * 获取群组账单列表
 * GET /api/expenses?groupId=1&page=1&pageSize=20
 */
router.get('/', (req, res) => {
  try {
    const { groupId, page = 1, pageSize = 20 } = req.query;
    const db = getDB();

    if (!groupId) {
      return res.status(400).json({ code: 400, message: '缺少群组ID' });
    }

    const membership = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );
    if (!membership) {
      return res.status(403).json({ code: 403, message: '你不是该账本成员' });
    }

    const offset = (Number(page) - 1) * Number(pageSize);

    const expenses = db.all(`
      SELECT e.*, u.nickname as payer_name, u.avatar_url as payer_avatar,
        c.name as category_name, c.icon as category_icon
      FROM expenses e
      LEFT JOIN users u ON e.payer_id = u.id
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.group_id = ?
      ORDER BY e.expense_date DESC, e.created_at DESC
      LIMIT ? OFFSET ?
    `, [groupId, Number(pageSize), offset]);

    // 获取每条账单的分摊详情
    for (const expense of expenses) {
      expense.splits = db.all(`
        SELECT es.*, u.nickname, u.avatar_url
        FROM expense_splits es
        LEFT JOIN users u ON es.user_id = u.id
        WHERE es.expense_id = ?
      `, [expense.id]);
    }

    const total = db.get(
      'SELECT COUNT(*) as cnt FROM expenses WHERE group_id = ?',
      [groupId]
    );

    res.json({
      code: 0,
      data: {
        list: expenses,
        total: total.cnt,
        page: Number(page),
        pageSize: Number(pageSize)
      }
    });
  } catch (err) {
    console.error('获取账单列表失败:', err);
    res.status(500).json({ code: 500, message: '获取账单列表失败' });
  }
});

/**
 * 获取账单详情
 * GET /api/expenses/:id
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDB();
    const expenseId = req.params.id;

    const expense = db.get(`
      SELECT e.*, u.nickname as payer_name, u.avatar_url as payer_avatar,
        c.name as category_name, c.icon as category_icon,
        g.id as group_id, g.name as group_name
      FROM expenses e
      LEFT JOIN users u ON e.payer_id = u.id
      LEFT JOIN categories c ON e.category_id = c.id
      LEFT JOIN groups_table g ON e.group_id = g.id
      WHERE e.id = ?
    `, [expenseId]);

    if (!expense) {
      return res.status(404).json({ code: 404, message: '账单不存在' });
    }

    // 验证用户是群组成员
    const membership = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [expense.group_id, req.user.id]
    );
    if (!membership) {
      return res.status(403).json({ code: 403, message: '你没有权限查看此账单' });
    }

    const splits = db.all(`
      SELECT es.*, u.nickname, u.avatar_url
      FROM expense_splits es
      LEFT JOIN users u ON es.user_id = u.id
      WHERE es.expense_id = ?
    `, [expenseId]);

    const members = db.all(`
      SELECT gm.user_id, u.nickname, u.avatar_url
      FROM group_members gm
      LEFT JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [expense.group_id]);

    res.json({
      code: 0,
      data: {
        expense: { ...expense, splits },
        members
      }
    });
  } catch (err) {
    console.error('获取账单详情失败:', err);
    res.status(500).json({ code: 500, message: '获取账单详情失败' });
  }
});

/**
 * 更新账单
 * PUT /api/expenses/:id
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDB();
    const expenseId = req.params.id;
    const { amount, categoryId, description, expenseDate, payerId, splits } = req.body;

    // 获取原账单
    const expense = db.get('SELECT * FROM expenses WHERE id = ?', [expenseId]);
    if (!expense) {
      return res.status(404).json({ code: 404, message: '账单不存在' });
    }

    // 验证权限：只能修改自己创建的账单
    if (expense.creator_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只能修改自己创建的账单' });
    }

    // 验证账本成员身份
    const membership = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [expense.group_id, req.user.id]
    );
    if (!membership) {
      return res.status(403).json({ code: 403, message: '你不是该账本成员' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ code: 400, message: '金额必须大于0' });
    }

    if (!splits || splits.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择分摊成员' });
    }

    // 验证分摊总额
    const totalShare = splits.reduce((sum, s) => sum + (s.shareAmount || 0), 0);
    if (Math.abs(totalShare - amount) > 0.01) {
      return res.status(400).json({ code: 400, message: `分摊金额(${totalShare})与总金额(${amount})不一致` });
    }

    // 更新账单
    const finalDescription = (!description || isDefaultDescription(description)) ? getDefaultDescription(categoryId || 1) : description;
    db.run('BEGIN');
    try {
      db.run(
        `UPDATE expenses SET amount = ?, category_id = ?, description = ?, expense_date = ?, payer_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [amount, categoryId || 1, finalDescription, expenseDate, payerId || req.user.id, expenseId]
      );

      // 删除旧分摊记录，插入新分摊记录
      db.run('DELETE FROM expense_splits WHERE expense_id = ?', [expenseId]);
      for (const split of splits) {
        db.run(
          'INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (?, ?, ?)',
          [expenseId, split.userId, split.shareAmount]
        );
      }

      // 更新群组时间
      db.run('UPDATE groups_table SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [expense.group_id]);
      db.run('COMMIT');

      const updatedExpense = db.get(`
        SELECT e.*, u.nickname as payer_name, u.avatar_url as payer_avatar,
          c.name as category_name, c.icon as category_icon
        FROM expenses e
        LEFT JOIN users u ON e.payer_id = u.id
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE e.id = ?
      `, [expenseId]);

      const detailSplits = db.all(`
        SELECT es.*, u.nickname, u.avatar_url
        FROM expense_splits es
        LEFT JOIN users u ON es.user_id = u.id
        WHERE es.expense_id = ?
      `, [expenseId]);

      res.json({
        code: 0,
        message: '更新成功',
        data: { ...updatedExpense, splits: detailSplits }
      });
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  } catch (err) {
    console.error('更新账单失败:', err);
    res.status(500).json({ code: 500, message: '更新账单失败: ' + (err.message || '') });
  }
});

/**
 * 删除账单
 * DELETE /api/expenses/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDB();
    const expenseId = req.params.id;

    const expense = db.get('SELECT * FROM expenses WHERE id = ?', [expenseId]);
    if (!expense) {
      return res.status(404).json({ code: 404, message: '账单不存在' });
    }

    if (expense.creator_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只能删除自己创建的账单' });
    }

    db.run('DELETE FROM expenses WHERE id = ?', [expenseId]);

    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    console.error('删除账单失败:', err);
    res.status(500).json({ code: 500, message: '删除账单失败' });
  }
});

module.exports = router;
