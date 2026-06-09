// pages/group/group.js
const { get, post, del } = require('../../utils/request');

Page({
  data: {
    groupId: null,
    group: null,
    expenses: [],
    loading: true,
    showMemberModal: false,
    showInviteModal: false,
    inviteCode: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ groupId: options.id });
      this.loadGroupDetail();
      this.loadExpenses();
    }
  },

  onShow() {
    if (this.data.groupId) {
      this.loadGroupDetail();
      this.loadExpenses();
    }
  },

  // 加载群组详情
  async loadGroupDetail() {
    try {
      const group = await get(`/groups/${this.data.groupId}`);
      this.setData({ group, loading: false });
    } catch (e) {
      console.error('加载群组失败', e);
      this.setData({ loading: false });
    }
  },

  // 加载账单列表
  async loadExpenses() {
    try {
      const result = await get(`/expenses?groupId=${this.data.groupId}&page=1&pageSize=50`);
      this.setData({ expenses: result.list || [] });
    } catch (e) {
      console.error('加载账单失败', e);
    }
  },

  // 添加账单
  goAddExpense() {
    wx.navigateTo({ url: `/pages/add-expense/add-expense?groupId=${this.data.groupId}` });
  },

  // 查看结算
  goSettlement() {
    wx.navigateTo({ url: `/pages/settlement/settlement?groupId=${this.data.groupId}` });
  },

  // 显示成员列表
  showMembers() {
    this.setData({ showMemberModal: true });
  },

  // 关闭成员列表
  closeMembers() {
    this.setData({ showMemberModal: false });
  },

  // 显示邀请码
  showInvite() {
    this.setData({ showInviteModal: true, inviteCode: this.data.group.invite_code });
  },

  // 关闭邀请码弹窗
  closeInvite() {
    this.setData({ showInviteModal: false });
  },

  // 复制邀请码
  copyInviteCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success() {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  // 退出群组
  async handleLeaveGroup() {
    const res = await wx.showModal({
      title: '提示',
      content: '确定要退出该群组吗？'
    });
    if (res.confirm) {
      try {
        await post(`/groups/${this.data.groupId}/leave`);
        wx.showToast({ title: '已退出', icon: 'success' });
        wx.navigateBack();
      } catch (e) {
        console.error('退出失败', e);
      }
    }
  }
});
