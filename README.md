# AA 记账

一个简洁的多人 AA 记账 Web 应用，支持账本管理、账单录入、均摊计算和结算功能。

## 功能特性

- 用户注册/登录（账号密码）
- 创建账本、邀请成员加入
- 记录账单（金额、分类、描述、日期、付款人）
- 自动均摊，查看每人应付金额
- 一键结算，生成转账建议
- 账单按日期分组展示

## 技术栈

- **后端**：Node.js + Express
- **数据库**：SQLite（sql.js，文件存储）
- **前端**：原生 HTML / CSS / JavaScript（SPA）

## 快速启动

```bash
cd backend
npm install
node server.js
```

浏览器访问：http://localhost:3001

## Docker 部署

```bash
cd backend
docker compose up -d
```

详见 [Docker 部署说明](#docker-部署)

## 目录结构

```
aa-accounting/
├── backend/
│   ├── server.js           # 入口文件
│   ├── package.json
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── src/
│   │   ├── routes/         # API 路由
│   │   ├── models/         # 数据库模型
│   │   └── middleware/     # 中间件
│   └── public/             # 前端静态文件
│       ├── index.html
│       ├── css/
│       └── js/
└── miniprogram/            # 小程序目录（备用）
```

## 数据持久化

数据库文件存储在 `backend/data/accounting.db`，请定期备份该文件。
