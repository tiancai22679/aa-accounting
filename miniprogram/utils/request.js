// utils/request.js - 网络请求封装

const app = getApp();

/**
 * 发起网络请求
 * @param {string} url - 请求路径（不含 baseUrl）
 * @param {string} method - 请求方法 GET/POST/PUT/DELETE
 * @param {object} data - 请求数据
 * @returns {Promise}
 */
function request(url, method = 'GET', data = {}) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || '';
    wx.request({
      url: `${app.globalData.baseUrl}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      success(res) {
        if (res.statusCode === 200) {
          if (res.data.code === 0) {
            resolve(res.data.data);
          } else {
            wx.showToast({ title: res.data.message || '请求失败', icon: 'none' });
            reject(new Error(res.data.message));
          }
        } else if (res.statusCode === 401) {
          // Token 失效，跳转登录
          wx.removeStorageSync('token');
          wx.redirectTo({ url: '/pages/login/login' });
          reject(new Error('登录已过期'));
        } else {
          wx.showToast({ title: `服务器错误(${res.statusCode})`, icon: 'none' });
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      },
      fail(err) {
        wx.showToast({ title: '网络错误', icon: 'none' });
        reject(err);
      }
    });
  });
}

module.exports = {
  request,
  get(url) { return request(url, 'GET'); },
  post(url, data) { return request(url, 'POST', data); },
  put(url, data) { return request(url, 'PUT', data); },
  del(url) { return request(url, 'DELETE'); }
};
