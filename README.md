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

从 Gitee 拉取最新代码并重新构建（内部存储小，构建后务必清理旧镜像）：

```bash
cd backend
git pull https://gitee.com/tiancai22679/aa-accounting.git main
docker compose down
docker compose up -d --build
docker image prune -f
```

> `docker image prune -f` 用于删除重建后残留的旧镜像，释放内部存储空间，建议每次部署都执行。

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

## 代码同步

本仓库通过 SSH 密钥自动同步到 Gitee 与 GitHub。在本工作区执行 `git commit` 后，`.git/hooks/post-commit` 钩子会自动执行：

```bash
git push gitee main
git push github main
```

无需手动推送、无需令牌。如需在其它环境启用，按以下步骤绑定：

1. 生成 SSH 密钥：`ssh-keygen -t ed25519 -C "备注"`
2. 将 `~/.ssh/id_ed25519.pub` 内容分别添加到 Gitee 和 GitHub 的 SSH 公钥设置
3. 将远端地址改为 SSH 格式（`git@gitee.com:用户名/仓库.git`）
4. 复制本仓库的 `.git/hooks/post-commit` 钩子到对应仓库的 `.git/hooks/` 目录
