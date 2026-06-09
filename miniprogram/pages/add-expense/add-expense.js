// pages/add-expense/add-expense.js
const { get, post } = require('../../utils/request');

Page({
  data: {
    groupId: null,
    amount: '',
    categoryId: 1,
    categories: [],
    description: '',
    expenseDate: '',
    members: [],
    selectedMembers: [], // 选中的成员ID列表
    splitMode: 'equal', // equal=均分, custom=自定义
    customSplits: [], // 自定义分摊
    loading: false
  },

  onLoad(options) {
    if (options.groupId) {
      this.setData({ groupId: options.groupId });
      this.setToday();
      this.loadCategories();
      this.loadMembers();
    }
  },

  // 设置今天日期
  setToday() {
    const today = new Date().toISOString().split('T')[0];
    this.setData({ expenseDate: today });
  },

  // 加载类别
  async loadCategories() {
    try {
      const categories = await get('/expenses/categories/all');
      this.setData({ categories });
    } catch (e) {
      console.error('加载类别失败', e);
    }
  },

  // 加载成员
  async loadMembers() {
    try {
      const group = await get(`/groups/${this.data.groupId}`);
      this.setData({
        members: group.members || [],
        selectedMembers: (group.members || []).map(m => m.user_id)
      });
    } catch (e) {
      console.error('加载成员失败', e);
    }
  },

  // 输入金额
  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
  },

  // 选择类别
  selectCategory(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ categoryId: id });
  },

  // 输入描述
  onDescInput(e) {
    this.setData({ description: e.detail.value });
  },

  // 选择日期
  onDateChange(e) {
    this.setData({ expenseDate: e.detail.value });
  },

  // 切换分摊模式
  switchSplitMode() {
    const mode = this.data.splitMode === 'equal' ? 'custom' : 'equal';
    this.setData({ splitMode: mode });
  },

  // 选择/取消选择成员
  toggleMember(e) {
    const userId = e.currentTarget.dataset.id;
    let selected = [...this.data.selectedMembers];
    const idx = selected.indexOf(userId);
    if (idx >= 0) {
      selected.splice(idx, 1);
    } else {
      selected.push(userId);
    }
    this.setData({ selectedMembers: selected });
  },

  // 提交账单
  async handleSubmit() {
    if (this.data.loading) return;
    const { groupId, amount, categoryId, description, expenseDate, selectedMembers, splitMode } = this.data;

    if (!amount || parseFloat(amount) <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    if (selectedMembers.length === 0) {
      wx.showToast({ title: '请选择分摊成员', icon: 'none' });
      return;
    }

    const amountNum = parseFloat(amount);
    let splits = [];

    if (splitMode === 'equal') {
      const share = Math.round(amountNum / selectedMembers.length * 100) / 100;
      splits = selectedMembers.map(uid => ({ userId: uid, shareAmount: share }));
      // 调整尾数
      const totalShare = splits.reduce((s, x) => s + x.shareAmount, 0);
      splits[0].shareAmount = Math.round((splits[0].shareAmount + amountNum - totalShare) * 100) / 100;
    } else {
      // 自定义分摊（简化版：均分）
      const share = Math.round(amountNum / selectedMembers.length * 100) / 100;
      splits = selectedMembers.map(uid => ({ userId: uid, shareAmount: share }));
    }

    this.setData({ loading: true });
    try {
      await post('/expenses', {
        groupId,
        amount: amountNum,
        categoryId,
        description,
        expenseDate,
        splits
      });
      wx.showToast({ title: '记账成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (e) {
      console.error('记账失败', e);
    } finally {
      this.setData({ loading: false });
    }
  }
});
