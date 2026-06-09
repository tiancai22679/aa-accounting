// AA记账 - 网页版主应用
var App = {
  currentView: '',
  currentGroupId: null,
  user: null,
  _cachedMembers: null,

  // === 初始化 ===
  init() {
    this.user = null;
    try {
      var saved = JSON.parse(localStorage.getItem('user') || 'null');
      if (saved && saved.id) this.user = saved;
    } catch (e) { localStorage.removeItem('user'); }

    if (API.getToken() && this.user) {
      this._tryEnterDashboard();
    } else {
      API.clearToken();
      this.renderLogin();
    }
  },

  async _tryEnterDashboard() {
    try {
      await API.getGroups();
      this.renderDashboard();
    } catch (err) {
      API.clearToken();
      this.user = null;
      this.renderLogin();
    }
  },

  // ==================== LOGIN / REGISTER ====================
  renderLogin() {
    this.currentView = 'login';
    $('#app-container').innerHTML =
      '<div class="login-page">' +
        '<div class="login-card">' +
          '<div class="login-icon">💰</div>' +
          '<h1>AA 记账</h1>' +
          '<p class="login-subtitle">多人在线记账，轻松分摊费用</p>' +
          '<div id="login-form-wrap"></div>' +
          '<div id="login-toggle-wrap" class="login-toggle"></div>' +
        '</div>' +
      '</div>';
    this._renderLoginForm();
  },

  _renderLoginForm() {
    $('#login-form-wrap').innerHTML =
      '<div class="form-group">' +
        '<label>用户名</label>' +
        '<input type="text" id="login-username" placeholder="输入用户名" maxlength="20" autocomplete="off" />' +
      '</div>' +
      '<div class="form-group">' +
        '<label>密码</label>' +
        '<input type="password" id="login-password" placeholder="输入密码" maxlength="32" autocomplete="off" />' +
      '</div>' +
      '<button id="btn-login-submit" class="btn btn-primary btn-block">登 录</button>';
    $('#login-toggle-wrap').innerHTML = '<p>没有账号？<a href="javascript:;" id="link-to-register">注册新账号</a></p>';

    var self = this;
    $('#btn-login-submit').onclick = async function() {
      var username = ($('#login-username').value || '').trim();
      var password = ($('#login-password').value || '').trim();
      if (!username) { self.showToast('请输入用户名', 'error'); return; }
      if (!password) { self.showToast('请输入密码', 'error'); return; }
      this.disabled = true;
      this.textContent = '登录中...';
      try {
        var data = await API.login(username, password);
        self.user = data.user;
        self.renderDashboard();
      } catch (err) {
        self.showToast(err.message || '登录失败', 'error');
        this.disabled = false;
        this.textContent = '登 录';
      }
    };
    $('#link-to-register').onclick = function(e) { e.preventDefault(); self._renderRegisterForm(); };
    $('#login-password').onkeydown = function(e) {
      if (e.key === 'Enter') $('#btn-login-submit').click();
    };
    $('#login-username').focus();
  },

  _renderRegisterForm() {
    $('#login-form-wrap').innerHTML =
      '<div class="form-group">' +
        '<label>用户名</label>' +
        '<input type="text" id="reg-username" placeholder="输入用户名（4-20位）" maxlength="20" autocomplete="off" />' +
      '</div>' +
      '<div class="form-group">' +
        '<label>密码</label>' +
        '<input type="password" id="reg-password" placeholder="输入密码（至少4位）" maxlength="32" autocomplete="off" />' +
      '</div>' +
      '<div class="form-group">' +
        '<label>昵称（选填）</label>' +
        '<input type="text" id="reg-nickname" placeholder="输入昵称" maxlength="20" autocomplete="off" />' +
      '</div>' +
      '<button id="btn-register-submit" class="btn btn-primary btn-block">注 册</button>';
    $('#login-toggle-wrap').innerHTML = '<p>已有账号？<a href="javascript:;" id="link-to-login">去登录</a></p>';

    var self = this;
    $('#btn-register-submit').onclick = async function() {
      var username = ($('#reg-username').value || '').trim();
      var password = ($('#reg-password').value || '').trim();
      var nickname = ($('#reg-nickname').value || '').trim();
      if (!username) { self.showToast('请输入用户名', 'error'); return; }
      if (!password) { self.showToast('请输入密码', 'error'); return; }
      if (password.length < 4) { self.showToast('密码至少4位', 'error'); return; }
      this.disabled = true;
      this.textContent = '注册中...';
      try {
        var data = await API.register(username, password, nickname);
        self.user = data.user;
        self.renderDashboard();
      } catch (err) {
        self.showToast(err.message || '注册失败', 'error');
        this.disabled = false;
        this.textContent = '注 册';
      }
    };
    $('#link-to-login').onclick = function(e) { e.preventDefault(); self._renderLoginForm(); };
    $('#reg-nickname').onkeydown = function(e) {
      if (e.key === 'Enter') $('#btn-register-submit').click();
    };
    $('#reg-username').focus();
  },

  // ==================== DASHBOARD ====================
  async renderDashboard() {
    this.currentView = 'dashboard';
    var self = this;

    this._renderShell('我的账本', true, false);

    try {
      var groups = await API.getGroups();
      var groupCards = groups.length > 0
        ? groups.map(function(g) {
            return '<div class="card group-card" data-gid="' + g.id + '">' +
              '<div class="group-card-header">' +
                '<div class="group-avatar">' + self.escape(g.name || '?')[0] + '</div>' +
                '<div class="group-info">' +
                  '<h3 class="group-name">' + self.escape(g.name) + '</h3>' +
                  '<p class="group-desc">' + self.escape(g.description || '') + ' · ' + (g.member_count || 0) + '人</p>' +
                '</div>' +
                (g.last_expense_amount ? '<div class="group-amount">¥' + Number(g.last_expense_amount).toFixed(2) + '</div>' : '') +
              '</div></div>';
          }).join('')
        : '<div class="empty-state"><div class="empty-icon">📋</div><p>还没有账本，创建一个吧</p></div>';

      $('#page-content').innerHTML =
        '<div class="dashboard-actions">' +
          '<button id="btn-create-group" class="btn btn-primary">+ 创建账本</button>' +
          '<button id="btn-join-group" class="btn btn-outline">加入账本</button>' +
        '</div>' +
        '<div class="section-title">账本列表</div>' +
        '<div class="group-list">' + groupCards + '</div>' +
        '<div id="modal-overlay" class="modal-overlay hidden"></div>';

      $('#btn-create-group').onclick = function() { self._showCreateGroupModal(); };
      $('#btn-join-group').onclick = function() { self._showJoinGroupModal(); };

      var cards = document.querySelectorAll('.group-card');
      for (var i = 0; i < cards.length; i++) {
        cards[i].onclick = function() {
          var gid = this.getAttribute('data-gid');
          if (gid) self.renderGroup(gid);
        };
      }
    } catch (err) {
      if (this._handleAuthError(err)) return;
      $('#page-content').innerHTML = '<div class="error-state"><p>加载失败: ' + self.escape(err.message) + '</p><button class="btn btn-outline" onclick="App.renderLogin()">重新登录</button></div>';
    }
  },

  // ==================== GROUP DETAIL ====================
  async renderGroup(groupId) {
    this.currentGroupId = groupId;
    this.currentView = 'group';
    var self = this;
    this._renderShell('账本详情', false, true);

    try {
      var detail = await API.getGroupDetail(groupId);
      var expenses = await API.getExpenses(groupId);
      var members = detail.members || [];
      this._cachedMembers = members;
      this._currentDetail = detail; // 缓存详情用于判断权限

      var isOwner = detail.created_by === this.user.id;

      // 按日期分组渲染账单卡片
      var todayStr = new Date().toISOString().slice(0, 10);
      var yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      var expenseParts = [];
      if (expenses && expenses.list && expenses.list.length > 0) {
        var lastDate = null;
        for (var i = 0; i < expenses.list.length; i++) {
          var e = expenses.list[i];
          if (e.expense_date !== lastDate) {
            var dateLabel = e.expense_date === todayStr ? '今天' : (e.expense_date === yesterdayStr ? '昨天' : e.expense_date);
            expenseParts.push('<div class="date-header">' + dateLabel + '</div>');
            lastDate = e.expense_date;
          }
          var splits = (e.splits || []).map(function(s) {
            return '<span class="split-tag">' + self.escape(s.nickname || '?') + ' ¥' + Number(s.share_amount).toFixed(2) + '</span>';
          }).join(' ');
          expenseParts.push('<div class="card expense-card" data-eid="' + e.id + '">' +
            '<div class="expense-left">' +
              '<span class="expense-icon">' + self.escape(e.category_icon || '💰') + '</span>' +
              '<div class="expense-info">' +
                '<div class="expense-desc">' + self.escape(e.description || '无描述') + '</div>' +
                '<div class="expense-meta"><span>' + e.expense_date + '</span><span>' + self.escape(e.payer_name || '?') + ' 支付</span></div>' +
                '<div class="expense-splits">' + splits + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="expense-right">' +
              '<span class="expense-amount">¥' + Number(e.amount).toFixed(2) + '</span>' +
              '<span class="expense-category">' + self.escape(e.category_name || '') + '</span>' +
            '</div></div>');
        }
      }
      var expenseHtml = expenseParts.length > 0 ? expenseParts.join('') : '<div class="empty-state"><div class="empty-icon">📝</div><p>还没有账单，点击下方按钮添加</p></div>';

      // 账本名称区域：创建人可见编辑按钮
      var nameSection = isOwner
        ? '<div class="group-detail-name-row">' +
            '<span class="group-detail-name">' + self.escape(detail.name) + '</span>' +
            '<button id="btn-edit-group-name" class="btn-icon-edit" title="编辑账本名称">✏️</button>' +
          '</div>'
        : '<div class="group-detail-name">' + self.escape(detail.name) + '</div>';

      $('#page-content').innerHTML =
        '<div class="group-detail-header">' +
          nameSection +
          '<div class="group-detail-desc">' + self.escape(detail.description || '') + '</div>' +
          '<div class="member-tags">' + members.map(function(m) { return '<span class="member-tag">' + self.escape(m.nickname || '成员') + '</span>'; }).join('') + '</div>' +
          '<div class="invite-code-row"><span>邀请码: <strong>' + detail.invite_code + '</strong></span></div>' +
        '</div>' +
        '<div class="group-quick-actions">' +
          '<button id="btn-add-expense" class="btn btn-primary">+ 记一笔</button>' +
          '<button id="btn-settlement" class="btn btn-outline">查看结算</button>' +
        '</div>' +
        '<div class="section-title">账单记录</div>' +
        '<div class="expense-list">' + expenseHtml + '</div>';

      $('#btn-add-expense').onclick = function() { self.renderAddExpense(groupId, self._cachedMembers); };
      $('#btn-settlement').onclick = function() { self.renderSettlement(groupId); };

      // 编辑账本名称（仅创建人）
      if (isOwner) {
        $('#btn-edit-group-name').onclick = function() { self._showEditGroupNameModal(groupId, detail.name); };
      }

      // 绑定账单卡片点击事件
      var expenseCards = document.querySelectorAll('.expense-card');
      for (var i = 0; i < expenseCards.length; i++) {
        expenseCards[i].onclick = function() {
          var eid = this.getAttribute('data-eid');
          if (eid) self.renderExpenseDetail(eid, groupId);
        };
      }
    } catch (err) {
      if (this._handleAuthError(err)) return;
      $('#page-content').innerHTML = '<div class="error-state"><p>加载失败: ' + self.escape(err.message) + '</p><button class="btn btn-outline" onclick="App.renderLogin()">重新登录</button></div>';
    }
  },

  // ==================== EXPENSE DETAIL (直接编辑，与记一笔界面一致) ====================
  async renderExpenseDetail(expenseId, groupId) {
    this.currentView = 'expenseDetail';
    this.currentGroupId = groupId;
    var self = this;
    this._renderShell('账单详情', false, false);

    try {
      var data = await API.getExpenseDetail(expenseId);
      var expense = data.expense;
      var members = data.members || [];
      this._cachedMembers = members;

      var isCreator = expense.creator_id === this.user.id;
      var categories = this._getCategories();

      var memberCheckboxes = members.map(function(m) {
        var isChecked = (expense.splits || []).some(function(s) { return s.user_id === m.user_id; });
        return '<label class="checkbox-label"><input type="checkbox" class="chk-member" value="' + m.user_id + '" ' + (isChecked ? 'checked' : '') + ' ' + (isCreator ? '' : 'disabled') + ' /><span>' + self.escape(m.nickname || '成员') + '</span></label>';
      }).join('');

      var payerOptions = members.map(function(m) {
        return '<option value="' + m.user_id + '" ' + (m.user_id === expense.payer_id ? 'selected' : '') + '>' + self.escape(m.nickname || '成员') + '</option>';
      }).join('');

      var catOptions = categories.map(function(c) {
        return '<option value="' + c.id + '" ' + (c.id === expense.category_id ? 'selected' : '') + '>' + c.icon + ' ' + c.name + '</option>';
      }).join('');

      var today = new Date().toISOString().slice(0, 10);

      $('#page-content').innerHTML =
        (isCreator ? '' : '<div class="permission-note">⚠️ 仅账单创建者可编辑，你只能查看</div>') +
        '<div class="expense-form">' +
          '<div class="form-group"><label>金额 (¥)</label><input type="number" id="exp-amount" step="0.01" min="0.01" value="' + Number(expense.amount).toFixed(2) + '" ' + (isCreator ? '' : 'disabled') + ' /></div>' +
          '<div class="form-group"><label>描述（选填）</label><input type="text" id="exp-desc" placeholder="例如：聚餐火锅" maxlength="100" value="' + self.escape(expense.description || '') + '" ' + (isCreator ? '' : 'disabled') + ' /></div>' +
          '<div class="form-group"><label>分类</label><select id="exp-category" ' + (isCreator ? '' : 'disabled') + '>' + catOptions + '</select></div>' +
          '<div class="form-group"><label>日期</label><input type="date" id="exp-date" value="' + (expense.expense_date || today) + '" max="' + today + '" ' + (isCreator ? '' : 'disabled') + ' /></div>' +
          '<div class="form-group"><label>付款人</label><select id="exp-payer" ' + (isCreator ? '' : 'disabled') + '>' + payerOptions + '</select></div>' +
          '<div class="form-group"><label>参与人（均分）</label><div class="checkbox-group">' + memberCheckboxes + '</div></div>' +
        '</div>' +
        (isCreator ? '<div class="form-actions">' +
          '<button id="btn-save-expense" class="btn btn-primary btn-block btn-large">💾 保存修改</button>' +
          '<button id="btn-delete-expense" class="btn btn-outline btn-block btn-danger">🗑️ 删除账单</button>' +
        '</div>' : '');

      if (isCreator) {
        $('#btn-save-expense').onclick = async function() {
          var btn = this;
          var amount = parseFloat($('#exp-amount').value);
          if (!amount || amount <= 0) { self.showToast('请输入有效金额', 'error'); return; }
          var desc = $('#exp-desc').value.trim();
          var catId = parseInt($('#exp-category').value);
          // 描述为空的场合，默认用"分类名+费用"
          if (!desc) {
            var cat = self._getCategories().find(function(c) { return c.id === catId; });
            desc = (cat ? cat.name : '其他') + '费用';
          }
          var expDate = $('#exp-date').value;
          var payerId = parseInt($('#exp-payer').value);

          var checks = document.querySelectorAll('.chk-member:checked');
          if (checks.length === 0) { self.showToast('请至少选择一个参与人', 'error'); return; }
          var memberIds = [];
          for (var i = 0; i < checks.length; i++) { memberIds.push(parseInt(checks[i].value)); }

          var shareAmt = parseFloat((amount / memberIds.length).toFixed(2));
          var splits = memberIds.map(function(uid, i) {
            if (i === memberIds.length - 1) {
              var assigned = shareAmt * (memberIds.length - 1);
              return { userId: uid, shareAmount: parseFloat((amount - assigned).toFixed(2)) };
            }
            return { userId: uid, shareAmount: shareAmt };
          });

          btn.disabled = true;
          btn.textContent = '保存中...';
          try {
            await API.updateExpense(expenseId, { groupId: groupId, amount: amount, categoryId: catId, description: desc, expenseDate: expDate, payerId: payerId, splits: splits });
            self.showToast('修改成功！');
            self.renderGroup(groupId);
          } catch (err) {
            self.showToast('修改失败: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = '💾 保存修改';
          }
        };

        $('#btn-delete-expense').onclick = async function() {
          if (!confirm('确定要删除这条账单吗？此操作不可恢复。')) return;
          try {
            await API.deleteExpense(expenseId);
            self.showToast('删除成功！');
            self.renderGroup(groupId);
          } catch (err) {
            self.showToast('删除失败: ' + err.message, 'error');
          }
        };

        // 切换分类时，若描述为空/默认值，自动更新描述
        $('#exp-category').onchange = function() {
          var descInput = $('#exp-desc');
          var curDesc = descInput.value.trim();
          if (self._isDefaultDescription(curDesc)) {
            var newCat = self._getCategories().find(function(c) { return c.id === parseInt(this.value); }.bind(this));
            descInput.value = newCat ? newCat.name + '费用' : '';
          }
        };
      }
    } catch (err) {
      if (this._handleAuthError(err)) return;
      $('#page-content').innerHTML = '<div class="error-state"><p>加载失败: ' + self.escape(err.message) + '</p><button class="btn btn-outline" onclick="App.renderGroup(\'' + groupId + '\')">返回</button></div>';
    }
  },

  // ==================== ADD EXPENSE ====================
  renderAddExpense(groupId, members) {
    this.currentGroupId = groupId;
    this.currentView = 'addExpense';
    var self = this;
    var memberList = members || this._cachedMembers || [];

    this._renderShell('记一笔', false, false);

    var categories = this._getCategories();

    var memberCheckboxes = memberList.map(function(m) {
      return '<label class="checkbox-label"><input type="checkbox" class="chk-member" value="' + m.user_id + '" checked /><span>' + self.escape(m.nickname || '成员') + '</span></label>';
    }).join('');

    var payerOptions = memberList.map(function(m) {
      return '<option value="' + m.user_id + '">' + self.escape(m.nickname || '成员') + '</option>';
    }).join('');

    var catOptions = categories.map(function(c) {
      return '<option value="' + c.id + '">' + c.icon + ' ' + c.name + '</option>';
    }).join('');

    var today = new Date().toISOString().slice(0, 10);

    $('#page-content').innerHTML =
      '<div class="expense-form">' +
        '<div class="form-group"><label>金额 (¥)</label><input type="number" id="exp-amount" step="0.01" min="0.01" placeholder="0.00" /></div>' +
        '<div class="form-group"><label>描述（选填）</label><input type="text" id="exp-desc" placeholder="例如：聚餐火锅" maxlength="100" /></div>' +
        '<div class="form-group"><label>分类</label><select id="exp-category">' + catOptions + '</select></div>' +
        '<div class="form-group"><label>日期</label><input type="date" id="exp-date" value="' + today + '" max="' + today + '" /></div>' +
        '<div class="form-group"><label>付款人</label><select id="exp-payer">' + payerOptions + '</select></div>' +
        '<div class="form-group"><label>参与人（均分）</label><div class="checkbox-group">' + memberCheckboxes + '</div></div>' +
        '<button id="btn-submit-expense" class="btn btn-primary btn-block btn-large">✓ 确认记账</button>' +
      '</div>';

    $('#btn-submit-expense').onclick = async function() {
      var amount = parseFloat($('#exp-amount').value);
      if (!amount || amount <= 0) { self.showToast('请输入有效金额', 'error'); return; }
      var desc = $('#exp-desc').value.trim();
      var catId = parseInt($('#exp-category').value);
      // 描述为空的场合，默认用"分类名+费用"
      if (!desc) {
        var cat = self._getCategories().find(function(c) { return c.id === catId; });
        desc = (cat ? cat.name : '其他') + '费用';
      }
      var expDate = $('#exp-date').value;
      var payerId = parseInt($('#exp-payer').value);

      var checks = document.querySelectorAll('.chk-member:checked');
      if (checks.length === 0) { self.showToast('请至少选择一个参与人', 'error'); return; }
      var memberIds = [];
      for (var i = 0; i < checks.length; i++) { memberIds.push(parseInt(checks[i].value)); }

      var shareAmt = parseFloat((amount / memberIds.length).toFixed(2));
      var splits = memberIds.map(function(uid, i) {
        if (i === memberIds.length - 1) {
          var assigned = shareAmt * (memberIds.length - 1);
          return { userId: uid, shareAmount: parseFloat((amount - assigned).toFixed(2)) };
        }
        return { userId: uid, shareAmount: shareAmt };
      });

      try {
        await API.addExpense({ groupId: self.currentGroupId, amount: amount, categoryId: catId, description: desc, expenseDate: expDate, payerId: payerId, splits: splits });
        self.showToast('记账成功！');
        self.renderGroup(self.currentGroupId);
      } catch (err) {
        self.showToast('记账失败: ' + err.message, 'error');
      }
    };

    // 切换分类时，若描述为空/默认值，自动更新描述
    $('#exp-category').onchange = function() {
      var descInput = $('#exp-desc');
      var curDesc = descInput.value.trim();
      if (self._isDefaultDescription(curDesc)) {
        var newCat = self._getCategories().find(function(c) { return c.id === parseInt(this.value); }.bind(this));
        descInput.value = newCat ? newCat.name + '费用' : '';
      }
    };
  },

  // ==================== SETTLEMENT ====================
  async renderSettlement(groupId) {
    this.currentGroupId = groupId;
    this.currentView = 'settlement';
    var self = this;
    this._renderShell('结算中心', false, false);

    try {
      var data = await API.getSettlement(groupId);

      var balanceHtml = (data.balances || []).map(function(b) {
        var cls = b.balance > 0 ? 'positive' : (b.balance < 0 ? 'negative' : 'zero');
        var sign = b.balance > 0 ? '+' : '';
        return '<div class="balance-row ' + cls + '">' +
          '<span class="balance-name">' + self.escape(b.nickname) + '</span>' +
          '<div class="balance-detail">' +
            '<span class="balance-label">垫付 <strong>¥' + Number(b.paid).toFixed(2) + '</strong></span>' +
            '<span class="balance-label">应付 <strong>¥' + Number(b.owed).toFixed(2) + '</strong></span>' +
          '</div>' +
          '<span class="balance-value">' + sign + '¥' + Number(Math.abs(b.balance)).toFixed(2) + '</span></div>';
      }).join('');

      var settlementHtml = data.settlements && data.settlements.length > 0
        ? '<div class="section-title">债务清算方案</div><div class="settlement-list">' +
          data.settlements.map(function(s) {
            return '<div class="settlement-item"><span class="settlement-from">' + self.escape(s.fromNickname) + '</span><span class="settlement-arrow">→</span><span class="settlement-to">' + self.escape(s.toNickname) + '</span><span class="settlement-amount">¥' + Number(s.amount).toFixed(2) + '</span></div>';
          }).join('') + '</div>'
        : '<div class="empty-state"><p>🎉 所有账目已结清！</p></div>';

      $('#page-content').innerHTML =
        '<div class="settlement-summary">' +
          '<div class="summary-stat"><div class="summary-value">¥' + Number(data.totalExpense || 0).toFixed(2) + '</div><div class="summary-label">总支出</div></div>' +
          '<div class="summary-stat"><div class="summary-value">' + (data.memberCount || 0) + '</div><div class="summary-label">参与人数</div></div>' +
        '</div>' +
        '<div class="section-title">个人余额</div>' +
        '<div class="balance-list">' + balanceHtml + '</div>' +
        settlementHtml;
    } catch (err) {
      if (this._handleAuthError(err)) return;
      $('#page-content').innerHTML = '<div class="error-state"><p>加载失败: ' + self.escape(err.message) + '</p><button class="btn btn-outline" onclick="App.renderLogin()">重新登录</button></div>';
    }
  },

  // ==================== SHELL ====================
  _renderShell(title, isDashboard, showBottomBar) {
    var backHtml = isDashboard
      ? '<button id="btn-logout" class="shell-back shell-logout">退出</button>'
      : '<button id="btn-back" class="shell-back">&larr; 返回</button>';
    
    var user = this.user || JSON.parse(localStorage.getItem('user') || 'null');
    var userHtml = user ? '<div class="shell-user"><span class="shell-user-name">' + this.escape(user.nickname || user.username) + '</span></div>' : '';
    
    $('#app-container').innerHTML =
      '<div class="page-shell">' +
        '<div class="shell-header">' +
          '<div class="shell-title-row">' + backHtml + '<h2 class="shell-title">' + this.escape(title) + '</h2>' + userHtml +
          '</div>' +
        '</div>' +
        '<div class="shell-content" id="page-content"></div>' +
        (showBottomBar ? '<div class="bottom-bar">' +
          '<button id="btn-bottom-expense" class="btn btn-primary">+ 记账</button>' +
          '<button id="btn-bottom-settlement" class="btn btn-outline">结算</button>' +
        '</div>' : '') +
      '</div>';

    var self = this;
    if (isDashboard) {
      $('#btn-logout').onclick = function() { self.logout(); };
    } else {
      $('#btn-back').onclick = function() {
        if (self.currentView === 'addExpense' || self.currentView === 'settlement' || self.currentView === 'expenseDetail') {
          self.renderGroup(self.currentGroupId);
        } else {
          self.renderDashboard();
        }
      };
    }

    if (showBottomBar) {
      $('#btn-bottom-expense').onclick = function() { self.renderAddExpense(self.currentGroupId, self._cachedMembers); };
      $('#btn-bottom-settlement').onclick = function() { self.renderSettlement(self.currentGroupId); };
    }
  },

  // ==================== MODALS ====================
  _showCreateGroupModal() {
    var self = this;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = '<div class="modal">' +
      '<h3>创建账本</h3>' +
      '<div class="form-group"><label>账本名称</label><input type="text" id="modal-group-name" placeholder="例如：周末旅行" maxlength="30" /></div>' +
      '<div class="form-group"><label>描述（选填）</label><input type="text" id="modal-group-desc" placeholder="简单描述一下" maxlength="100" /></div>' +
      '<div class="modal-actions">' +
        '<button id="btn-modal-cancel" class="btn btn-outline">取消</button>' +
        '<button id="btn-modal-confirm" class="btn btn-primary">创建</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    overlay.onclick = function(e) { if (e.target === overlay) self._hideModal(); };
    $('#btn-modal-cancel').onclick = function() { self._hideModal(); };
    $('#btn-modal-confirm').onclick = async function() {
      var name = $('#modal-group-name').value.trim();
      if (!name) { self.showToast('请输入账本名称', 'error'); return; }
      var desc = $('#modal-group-desc').value.trim();
      try {
        var data = await API.createGroup(name, desc);
        self._hideModal();
        self.showToast('账本「' + name + '」创建成功！邀请码: ' + data.invite_code);
        self.renderDashboard();
      } catch (err) {
        self.showToast('创建失败: ' + err.message, 'error');
      }
    };
  },

  _showJoinGroupModal() {
    var self = this;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = '<div class="modal">' +
      '<h3>加入账本</h3>' +
      '<div class="form-group"><label>邀请码</label><input type="text" id="modal-invite-code" placeholder="输入6位邀请码" maxlength="6" style="text-transform:uppercase" /></div>' +
      '<div class="modal-actions">' +
        '<button id="btn-modal-cancel" class="btn btn-outline">取消</button>' +
        '<button id="btn-modal-confirm" class="btn btn-primary">加入</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    overlay.onclick = function(e) { if (e.target === overlay) self._hideModal(); };
    $('#btn-modal-cancel').onclick = function() { self._hideModal(); };
    $('#btn-modal-confirm').onclick = async function() {
      var code = $('#modal-invite-code').value.trim().toUpperCase();
      if (!code || code.length < 6) { self.showToast('请输入6位邀请码', 'error'); return; }
      try {
        var data = await API.joinGroup(code);
        self._hideModal();
        self.showToast('已加入账本「' + data.name + '」！');
        self.renderDashboard();
      } catch (err) {
        self.showToast('加入失败: ' + err.message, 'error');
      }
    };
  },

  _showEditGroupNameModal(groupId, currentName) {
    var self = this;
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = '<div class="modal">' +
      '<h3>编辑账本名称</h3>' +
      '<div class="form-group"><label>账本名称</label><input type="text" id="modal-group-name" value="' + self.escape(currentName) + '" placeholder="输入账本名称" maxlength="30" /></div>' +
      '<div class="modal-actions">' +
        '<button id="btn-modal-cancel" class="btn btn-outline">取消</button>' +
        '<button id="btn-modal-confirm" class="btn btn-primary">保存</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    overlay.onclick = function(e) { if (e.target === overlay) self._hideModal(); };
    $('#btn-modal-cancel').onclick = function() { self._hideModal(); };
    $('#btn-modal-confirm').onclick = async function() {
      var name = $('#modal-group-name').value.trim();
      if (!name) { self.showToast('账本名称不能为空', 'error'); return; }
      try {
        await API.updateGroup(groupId, { name: name });
        self._hideModal();
        self.showToast('账本名称已更新！');
        self.renderGroup(groupId);
      } catch (err) {
        self.showToast('修改失败: ' + err.message, 'error');
      }
    };
  },

  _hideModal() {
    var el = document.getElementById('modal-overlay');
    if (el) el.remove();
  },

  // ==================== UTILS ====================
  // 判断描述是否为自动生成的默认描述（"分类名+费用"），若是则分类变更时自动更新
  _isDefaultDescription(desc) {
    if (!desc) return true;
    var cats = this._getCategories();
    for (var i = 0; i < cats.length; i++) {
      if (desc === cats[i].name + '费用') return true;
    }
    return false;
  },

  _getCategories() {
    return [
      { id: 1, icon: '🍽️', name: '餐饮' }, { id: 2, icon: '🚗', name: '交通' },
      { id: 3, icon: '🏨', name: '住宿' }, { id: 4, icon: '🛒', name: '购物' },
      { id: 5, icon: '🎮', name: '娱乐' }, { id: 6, icon: '📱', name: '通讯' },
      { id: 7, icon: '💊', name: '医疗' }, { id: 8, icon: '📚', name: '学习' },
      { id: 9, icon: '🎁', name: '礼物' }, { id: 10, icon: '💡', name: '日用' },
      { id: 11, icon: '✈️', name: '旅行' }, { id: 12, icon: '🔧', name: '其他' }
    ];
  },

  logout() {
    API.logout();
    this.user = null;
    this.renderLogin();
  },

  showToast(message, type) {
    type = type || 'success';
    var existing = document.getElementById('toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(function() { toast.classList.add('show'); });
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 2500);
  },

  _handleAuthError(err) {
    if (err.message && (err.message.indexOf('登录已过期') >= 0 || err.message.indexOf('未登录') >= 0)) {
      API.clearToken();
      this.user = null;
      localStorage.removeItem('user');
      this.renderLogin();
      return true;
    }
    return false;
  },

  escape(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// 便捷选择器
function $(sel) { return document.querySelector(sel); }

// 启动
document.addEventListener('DOMContentLoaded', function() { App.init(); });
