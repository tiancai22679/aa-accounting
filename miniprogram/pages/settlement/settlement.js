// pages/settlement/settlement.js
const { get, post } = require('../../utils/request');

Page({
  data: {
    groupId: null,
    balances: [],
    settlements: [],
    history: [],
    totalExpense: 0,
    loading: true
  },

  onLoad(options) {
    if (options.groupId) {
      this.setData({ groupId: options.groupId });
      this.loadSettlement();
    }
  },

  onShow() {
    if (this.data.groupId) {
      this.loadSettlement();
    }
  },

  // 加载结算数据
  async loadSettlement() {
    this.setData({ loading: true });
    try {
      const data = await get(`/settlement/${this.data.groupId}`);
      this.setData({
        balances: data.balances || [],
        settlements: data.settlements || [],
        history: data.history || [],
        totalExpense: data.totalExpense || 0,
        loading: false
      });
    } catch (e) {
      console.error('加载结算数据失败', e);
      this.setData({ loading: false });
    }
  },

  // 确认结算
  async handleConfirmSettlement(e) {
    const { fromuserid, touserid, amount } = e.currentTarget.dataset;
    const res = await wx.showModal({
      title: '确认结算',
      content: `确认 ${e.currentTarget.dataset.fromnickname} 已向 ${e.currentTarget.dataset.tonickname} 支付 ¥${amount}？`
    });
    if (res.confirm) {
      try {
        await post(`/settlement/${this.data.groupId}/confirm`, {
          fromUserId: fromUserId,
          toUserId: toUserId,
          amount: amount
        });
        wx.showToast({ title: '结算成功', icon: 'success' });
        this.loadSettlement();
      } catch (e) {
        console.error('结算失败', e);
      }
    }
  }
});
