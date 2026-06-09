// pages/index/index.js
const { get, post } = require('../../utils/request');

Page({
  data: {
    groups: [],
    loading: true,
    showCreateModal: false,
    showJoinModal: false,
    newGroupName: '',
    newGroupDesc: '',
    inviteCode: ''
  },

  onLoad() {
    this.loadGroups();
  },

  onShow() {
    this.loadGroups();
  },

  // 加载群组列表
  async loadGroups() {
    this.setData({ loading: true });
    try {
      const groups = await get('/groups');
      this.setData({ groups, loading: false });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  // 打开创建群组弹窗
  showCreate() {
    this.setData({ showCreateModal: true, newGroupName: '', newGroupDesc: '' });
  },

  // 关闭创建群组弹窗
  closeCreate() {
    this.setData({ showCreateModal: false });
  },

  // 输入群组名称
  onGroupNameInput(e) {
    this.setData({ newGroupName: e.detail.value });
  },

  // 输入群组描述
  onGroupDescInput(e) {
    this.setData({ newGroupDesc: e.detail.value });
  },

  // 创建群组
  async handleCreateGroup() {
    if (!this.data.newGroupName.trim()) {
      wx.showToast({ title: '请输入群组名称', icon: 'none' });
      return;
    }
    try {
      const group = await post('/groups', {
        name: this.data.newGroupName,
        description: this.data.newGroupDesc
      });
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.setData({ showCreateModal: false });
      this.loadGroups();
    } catch (e) {
      console.error('创建失败', e);
    }
  },

  // 打开加入群组弹窗
  showJoin() {
    this.setData({ showJoinModal: true, inviteCode: '' });
  },

  // 关闭加入群组弹窗
  closeJoin() {
    this.setData({ showJoinModal: false });
  },

  // 输入邀请码
  onInviteCodeInput(e) {
    this.setData({ inviteCode: e.detail.value.toUpperCase() });
  },

  // 加入群组
  async handleJoinGroup() {
    if (!this.data.inviteCode.trim()) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    try {
      await post('/groups/join', { inviteCode: this.data.inviteCode });
      wx.showToast({ title: '加入成功', icon: 'success' });
      this.setData({ showJoinModal: false });
      this.loadGroups();
    } catch (e) {
      console.error('加入失败', e);
    }
  },

  // 进入群组详情
  goToGroup(e) {
    const groupId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/group/group?id=${groupId}` });
  }
});
