// API 请求客户端
const API = {
  baseUrl: '/api',
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  setToken(t, u) {
    this.token = t;
    this.user = u;
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
  },

  getToken() { return this.token; },

  clearToken() {
    this.token = '';
    this.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  async request(method, path, data) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (this.token) opts.headers['Authorization'] = 'Bearer ' + this.token;
    if (data) opts.body = JSON.stringify(data);

    const res = await fetch(this.baseUrl + path, opts);
    const json = await res.json();

    if (json.code === 401) {
      this.clearToken();
      throw new Error('登录已过期，请重新登录');
    }
    if (json.code !== 0) throw new Error(json.message || '请求失败');
    return json.data;
  },

  // === Auth ===
  async login(username, password) {
    const data = await this.request('POST', '/auth/login', { username, password });
    if (data && data.token) {
      this.setToken(data.token, data.user);
    }
    return data;
  },

  async register(username, password, nickname) {
    const data = await this.request('POST', '/auth/register', { username, password, nickname });
    if (data && data.token) {
      this.setToken(data.token, data.user);
    }
    return data;
  },

  async getProfile() {
    return this.request('GET', '/auth/profile');
  },

  async logout() {
    try { await this.request('POST', '/auth/logout'); } catch (e) {}
    this.clearToken();
  },

  // === Groups ===
  getGroups() {
    return this.request('GET', '/groups');
  },

  createGroup(name, description) {
    return this.request('POST', '/groups', { name, description });
  },

  joinGroup(inviteCode) {
    return this.request('POST', '/groups/join', { inviteCode });
  },

  updateGroup(groupId, data) {
    return this.request('PUT', '/groups/' + groupId, data);
  },

  getGroupDetail(groupId) {
    return this.request('GET', '/groups/' + groupId);
  },

  leaveGroup(groupId) {
    return this.request('DELETE', '/groups/' + groupId + '/leave');
  },

  deleteGroup(groupId) {
    return this.request('DELETE', '/groups/' + groupId);
  },

  // === Expenses ===
  getExpenses(groupId) {
    return this.request('GET', '/expenses?groupId=' + groupId);
  },

  addExpense(data) {
    return this.request('POST', '/expenses', data);
  },

  deleteExpense(expenseId) {
    return this.request('DELETE', '/expenses/' + expenseId);
  },

  getExpenseDetail(expenseId) {
    return this.request('GET', '/expenses/' + expenseId);
  },

  updateExpense(expenseId, data) {
    return this.request('PUT', '/expenses/' + expenseId, data);
  },

  // === Settlement ===
  getSettlement(groupId) {
    return this.request('GET', '/settlement/' + groupId);
  },

  confirmSettlement(groupId, data) {
    return this.request('POST', '/settlement/' + groupId + '/confirm', data);
  }
};
