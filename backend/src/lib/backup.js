// backend/src/lib/backup.js
// 数据库定时备份到 WebDAV（基于 Node 内置 http/https，无第三方依赖）
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { getSetting, setSetting, exportDB } = require('../models/database');

const KEYS = {
  enabled: 'backup_enabled',
  url: 'backup_webdav_url',
  username: 'backup_webdav_username',
  password: 'backup_webdav_password',
  remotePath: 'backup_webdav_path',
  hour: 'backup_hour',
  lastAt: 'backup_last_at',
  lastStatus: 'backup_last_status'
};

function getConfig() {
  return {
    enabled: getSetting(KEYS.enabled, '0') === '1',
    url: getSetting(KEYS.url, ''),
    username: getSetting(KEYS.username, ''),
    password: getSetting(KEYS.password, ''),
    remotePath: getSetting(KEYS.remotePath, ''),
    hour: parseInt(getSetting(KEYS.hour, '2'), 10) || 2,
    lastBackupAt: getSetting(KEYS.lastAt, ''),
    lastBackupStatus: getSetting(KEYS.lastStatus, '')
  };
}

function saveConfig(data) {
  if (data.enabled !== undefined) setSetting(KEYS.enabled, data.enabled ? '1' : '0');
  if (data.url !== undefined) setSetting(KEYS.url, data.url);
  if (data.username !== undefined) setSetting(KEYS.username, data.username);
  if (data.password !== undefined) setSetting(KEYS.password, data.password); // 允许空串清除
  if (data.remotePath !== undefined) setSetting(KEYS.remotePath, data.remotePath);
  if (data.hour !== undefined) setSetting(KEYS.hour, String(data.hour));
}

function recordResult(success, message) {
  setSetting(KEYS.lastAt, new Date().toISOString());
  setSetting(KEYS.lastStatus, (success ? '成功' : '失败') + (message ? ': ' + message : ''));
}

// 构造完整目标 URL（remotePath 视为 base 之下的子目录）
function buildTarget(url, remotePath, filename) {
  let base = (url || '').trim();
  if (!base) throw new Error('WebDAV 地址为空');
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  const u = new URL(base);
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  let dir = (remotePath || '').trim().replace(/^\/+/, '');
  if (dir && !dir.endsWith('/')) dir += '/';
  u.pathname = u.pathname + dir + filename;
  return u.href;
}

// 解析 Digest 挑战
function parseDigest(header) {
  const m = {};
  const re = /(\w+)=(?:"([^"]*)"|([^,\s]*))/g;
  let match;
  while ((match = re.exec(header)) !== null) {
    m[match[1]] = match[2] !== undefined ? match[2] : match[3];
  }
  return m;
}

function digestHeader(auth, method, path, ch) {
  const ha1 = crypto.createHash('md5').update(auth.username + ':' + ch.realm + ':' + auth.password).digest('hex');
  const ha2 = crypto.createHash('md5').update(method + ':' + path).digest('hex');
  const qop = (ch.qop || '').split(',').map(s => s.trim()).includes('auth') ? 'auth' : null;
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  let response;
  if (qop) {
    response = crypto.createHash('md5').update(ha1 + ':' + ch.nonce + ':' + nc + ':' + cnonce + ':' + qop + ':' + ha2).digest('hex');
  } else {
    response = crypto.createHash('md5').update(ha1 + ':' + ch.nonce + ':' + ha2).digest('hex');
  }
  let h = 'Digest username="' + auth.username + '", realm="' + ch.realm + '", nonce="' + ch.nonce + '", uri="' + path + '", response="' + response + '"';
  if (ch.opaque) h += ', opaque="' + ch.opaque + '"';
  if (qop) h += ', qop=' + qop + ', nc=' + nc + ', cnonce="' + cnonce + '"';
  return h;
}

// 通用 WebDAV 请求，自动处理 Basic + Digest 回退
function webdavRequest(method, urlStr, data, auth) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const doRequest = (authHeaderValue) => {
      const headers = {};
      if (authHeaderValue) headers['Authorization'] = authHeaderValue;
      if (data && method === 'PUT') {
        headers['Content-Type'] = 'application/octet-stream';
        headers['Content-Length'] = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
      }
      const req = lib.request(u, { method, headers }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          if (res.statusCode === 401 && res.headers['www-authenticate'] && auth && auth.username) {
            const wa = res.headers['www-authenticate'];
            if (wa.indexOf('Digest') !== -1) {
              const ch = parseDigest(wa);
              const dig = digestHeader(auth, method, u.pathname + u.search, ch);
              const req2 = lib.request(u, { method, headers: { ...headers, Authorization: 'Digest ' + dig } }, (res2) => {
                let b2 = ''; res2.on('data', c => b2 += c); res2.on('end', () => resolve({ status: res2.statusCode, body: b2 }));
              });
              req2.on('error', reject);
              if (data && method === 'PUT') req2.write(data);
              req2.end();
              return;
            }
          }
          resolve({ status: res.statusCode, body });
        });
      });
      req.on('error', reject);
      if (data && method === 'PUT') req.write(data);
      req.end();
    };
    if (auth && auth.username) {
      doRequest('Basic ' + Buffer.from(auth.username + ':' + (auth.password || '')).toString('base64'));
    } else {
      doRequest(null);
    }
  });
}

// 逐级创建父目录
async function ensureParentDirs(targetUrl, auth) {
  const u = new URL(targetUrl);
  const segs = u.pathname.split('/').filter(Boolean);
  let cur = u.origin + '/';
  for (let i = 0; i < segs.length - 1; i++) {
    cur += segs[i] + '/';
    try { await webdavRequest('MKCOL', cur, null, auth); } catch (e) { /* 忽略已存在等 */ }
  }
}

async function performBackup(force) {
  const cfg = getConfig();
  if (!force && !cfg.enabled) {
    console.log('[备份] 未启用自动备份，跳过');
    return { skipped: true };
  }
  if (!cfg.url) {
    recordResult(false, 'WebDAV 地址未配置');
    return { success: false, error: 'WebDAV 地址未配置' };
  }
  try {
    const buf = exportDB();
    const fname = 'accounting.db';
    const target = buildTarget(cfg.url, cfg.remotePath, fname);
    const auth = { username: cfg.username, password: cfg.password };
    await ensureParentDirs(target, auth);
    const res = await webdavRequest('PUT', target, buf, auth);
    if (res.status >= 200 && res.status < 300) {
      recordResult(true, '已上传 ' + fname);
      console.log('[备份] 成功上传至', target);
      return { success: true, file: fname, target };
    } else {
      recordResult(false, 'HTTP ' + res.status);
      console.error('[备份] 上传失败 HTTP', res.status, res.body);
      return { success: false, error: 'HTTP ' + res.status, body: res.body };
    }
  } catch (e) {
    recordResult(false, e.message);
    console.error('[备份] 失败:', e.message);
    return { success: false, error: e.message };
  }
}

let timer = null;
function msUntilNext(hour) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

function scheduleNext() {
  const cfg = getConfig();
  const hour = cfg.hour || 2;
  const ms = msUntilNext(hour);
  const next = new Date(Date.now() + ms);
  console.log('[备份] 下次自动备份时间:', next.toLocaleString(), '(' + Math.round(ms / 60000) + ' 分钟后)');
  timer = setTimeout(async () => {
    console.log('[备份] 触发定时备份');
    try { await performBackup(); } catch (e) { console.error('[备份] 异常:', e); }
    scheduleNext();
  }, ms);
}

function startScheduler() {
  if (timer) clearTimeout(timer);
  scheduleNext();
}

module.exports = { getConfig, saveConfig, performBackup, startScheduler };
