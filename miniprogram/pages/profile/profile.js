// pages/profile/profile.js
const { get, put } = require('../../utils/request');

Page({
  data: {
    userInfo: null,
    nickname: '',
    loading: false
  },

  onLoad() {
    this.loadUserInfo();
  },

  onShow() {
    this.loadUserInfo();
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo, nickname: userInfo.nickname || '' });
    }
  },

  // 输入昵称
  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  // 保存昵称
  async handleSaveNickname() {
    if (!this.data.nickname.trim()) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const user = await put('/users/profile', { nickname: this.data.nickname });
      wx.setStorageSync('userInfo', user);
      getApp().globalData.userInfo = user;
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (e) {
      console.error('保存失败', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  // 退出登录
  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  }
});
