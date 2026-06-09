// app.js
App({
  onLaunch() {
    // 检查登录状态
    const token = wx.getStorageSync('token');
    if (!token) {
      // 未登录，跳转到登录页
      wx.redirectTo({ url: '/pages/login/login' });
    }
  },

  globalData: {
    userInfo: null,
    token: '',
    baseUrl: 'http://localhost:3001/api' // 开发环境，正式环境改为真实域名
  }
});
