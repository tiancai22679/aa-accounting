// pages/login/login.js
const { post } = require('../../utils/request');

Page({
  data: {
    loading: false
  },

  onLoad() {
    const token = wx.getStorageSync('token');
    if (token) {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  handleWechatLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    const devOpenid = 'dev_' + Math.random().toString(36).substring(2, 10);

    post('/auth/login', { code: devOpenid, nickname: '微信用户' })
      .then(res => {
        wx.setStorageSync('token', res.token);
        wx.setStorageSync('userInfo', res.user);
        getApp().globalData.userInfo = res.user;
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 1000);
      })
      .catch(err => {
        console.error('登录失败:', err);
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});
