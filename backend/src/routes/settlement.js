const express = require('express');
const router = express.Router();
const { getDB } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

/**
 * 计算群组结算结果
 * GET /api/settlement/:groupId
 *
 * 算法说明：
 * 1. 统计每个人垫付了多少钱
 * 2. 统计每个人应该承担多少钱（分摊）
 * 3. 计算净差额：垫付 - 应承担
 * 4. 正数=别人欠TA，负数=TA欠别人
 * 5. 通过贪心算法简化债务链
 */
router.get('/:groupId', (req, res) => {
  try {
    const db = getDB();
    const groupId = req.params.groupId;

    // 验证成员身份
    const membership = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );
    if (!membership) {
      return res.status(403).json({ code: 403, message: '你不是该群组成员' });
    }

    // 获取所有成员
    const members = db.all(`
      SELECT gm.*, u.nickname, u.avatar_url
      FROM group_members gm
      LEFT JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `, [groupId]);

    // 初始化每个人的余额（含结算状态）
    const balances = {};
    members.forEach(m => {
      balances[m.user_id] = {
        userId: m.user_id, nickname: m.nickname, avatarUrl: m.avatar_url,
        paid: 0, owed: 0, balance: 0,
        isSettled: !!m.is_settled, settledAt: m.settled_at || null
      };
    });

    // 获取所有未结算的分摊记录
    const allSplits = db.all(`
      SELECT es.*, e.payer_id, e.amount, e.description, e.expense_date
      FROM expense_splits es
      JOIN expenses e ON es.expense_id = e.id
      WHERE e.group_id = ? AND es.is_settled = 0
    `, [groupId]);

    // 计算每个人的垫付和应承担
    const processedPayers = new Set();
    for (const split of allSplits) {
      // 应付人应承担
      if (balances[split.user_id]) {
        balances[split.user_id].owed += split.share_amount;
      }

      // 付款人垫付（每笔只算一次）
      if (!processedPayers.has(split.expense_id)) {
        processedPayers.add(split.expense_id);
        if (balances[split.payer_id]) {
          balances[split.payer_id].paid += split.amount;
        }
      }
    }

    // 计算净余额
    Object.values(balances).forEach(b => {
      b.balance = Math.round((b.paid - b.owed) * 100) / 100;
    });

    // 简化债务链（贪心算法）
    const creditors = []; // 应该收钱的人（balance > 0）
    const debtors = [];   // 应该付钱的人（balance < 0）

    Object.values(balances).forEach(b => {
      if (b.balance > 0.01) {
        creditors.push({ ...b, remaining: b.balance });
      } else if (b.balance < -0.01) {
        debtors.push({ ...b, remaining: -b.balance });
      }
    });

    // 贪心匹配：最大债务人 -> 最大债权人
    const settlements = [];
    let ci = 0, di = 0;

    while (ci < creditors.length && di < debtors.length) {
      const creditor = creditors[ci];
      const debtor = debtors[di];

      const amount = Math.min(creditor.remaining, debtor.remaining);
      if (amount > 0.01) {
        settlements.push({
          fromUserId: debtor.userId,
          fromNickname: debtor.nickname,
          fromAvatarUrl: debtor.avatarUrl,
          toUserId: creditor.userId,
          toNickname: creditor.nickname,
          toAvatarUrl: creditor.avatarUrl,
          amount: Math.round(amount * 100) / 100
        });
      }

      creditor.remaining -= amount;
      debtor.remaining -= amount;

      if (creditor.remaining < 0.01) ci++;
      if (debtor.remaining < 0.01) di++;
    }

    // 获取结算历史
    const history = db.all(`
      SELECT s.*,
        fu.nickname as from_nickname, fu.avatar_url as from_avatar,
        tu.nickname as to_nickname, tu.avatar_url as to_avatar
      FROM settlements s
      LEFT JOIN users fu ON s.from_user_id = fu.id
      LEFT JOIN users tu ON s.to_user_id = tu.id
      WHERE s.group_id = ?
      ORDER BY s.settled_at DESC
      LIMIT 50
    `, [groupId]);

    // 统计摘要
    const totalExpense = allSplits.length > 0 ? members.reduce((sum, m) => {
      if (balances[m.user_id]) return sum + balances[m.user_id].paid;
      return sum;
    }, 0) : 0;

    // 计算每个成员的应结算金额
    const processedExpenseIds = new Set();
    const total = members.reduce((sum, m) => {
      if (balances[m.user_id]) return sum + balances[m.user_id].paid;
      return sum;
    }, 0);

    res.json({
      code: 0,
      data: {
        groupId,
        totalExpense: Math.round(total * 100) / 100,
        memberCount: members.length,
        balances: Object.values(balances).map(b => ({
          ...b,
          paid: Math.round(b.paid * 100) / 100,
          owed: Math.round(b.owed * 100) / 100,
          balance: Math.round(b.balance * 100) / 100
        })),
        settlements,
        history
      }
    });
  } catch (err) {
    console.error('获取结算信息失败:', err);
    res.status(500).json({ code: 500, message: '获取结算信息失败' });
  }
});

/**
 * 确认结算（记录结算操作）
 * POST /api/settlement/:groupId/confirm
 * Body: { fromUserId, toUserId, amount }
 */
router.post('/:groupId/confirm', (req, res) => {
  try {
    const db = getDB();
    const groupId = req.params.groupId;
    const { fromUserId, toUserId, amount } = req.body;

    const membership = db.get(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );
    if (!membership) {
      return res.status(403).json({ code: 403, message: '你不是该群组成员' });
    }

    // 记录结算
    db.run(
      'INSERT INTO settlements (group_id, from_user_id, to_user_id, amount) VALUES (?, ?, ?, ?)',
      [groupId, fromUserId, toUserId, amount]
    );

    // 标记相关分摊为已结算
    db.run(`
      UPDATE expense_splits SET is_settled = 1, settled_at = CURRENT_TIMESTAMP
      WHERE expense_id IN (
        SELECT id FROM expenses WHERE group_id = ?
      )
      AND user_id = ?
      AND is_settled = 0
    `, [groupId, fromUserId]);

    res.json({ code: 0, message: '结算记录已保存' });
  } catch (err) {
    console.error('确认结算失败:', err);
    res.status(500).json({ code: 500, message: '确认结算失败' });
  }
});

module.exports = router;
