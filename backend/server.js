const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./src/models/database');

// 路由
const authRoutes = require('./src/routes/auth');
const groupRoutes = require('./src/routes/groups');
const expenseRoutes = require('./src/routes/expenses');
const settlementRoutes = require('./src/routes/settlement');
const userRoutes = require('./src/routes/users');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 启动服务
async function start() {
  // 初始化数据库
  await initDB();

  // 静态文件服务 - 网页版前端
  app.use(express.static(path.join(__dirname, 'public')));

  // 路由注册
  app.use('/api/auth', authRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/settlement', settlementRoutes);
  app.use('/api/users', userRoutes);

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // 错误处理
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
      code: 500,
      message: '服务器内部错误',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });

  app.listen(PORT, () => {
    console.log(`✅ AA记账后端服务已启动，端口: ${PORT}`);
    console.log(`📡 API地址: http://localhost:${PORT}/api`);
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});

module.exports = app;
