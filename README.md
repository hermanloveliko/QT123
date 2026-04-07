# 青泰建材 · 官网与后台

React（Vite）前台 + Express API + PostgreSQL（Prisma）。本地需同时启动前端与 API。

## 环境要求

- Node.js 18+
- PostgreSQL

## 配置

复制 `.env.example` 为 `.env`，至少填写：

- `DATABASE_URL` — PostgreSQL 连接串  
- `ADMIN_JWT_SECRET` — 随机字符串  
- `WEB_ORIGIN` — 浏览器访问前端的地址，默认 `http://localhost:3000`  
- `DEEPSEEK_API_KEY` —（可选）在线 AI 咨询，不填则仅用关键词匹配与兜底文案  

可选：`API_PORT`（默认 `8787`）、`VITE_API_BASE`（与 API 地址一致，开发时 Vite 已代理 `/api` 可省略）。

## 数据库

```bash
npx prisma migrate dev
# 或: npx prisma db push
npm run db:seed
```

默认管理员：`QT123` / `QT123`。

## 本地运行

终端 1 — API：

```bash
npm run dev:api
```

终端 2 — 前端：

```bash
npm run dev
```

- 前台：<http://localhost:3000>  
- 后台：<http://localhost:3000/admin>（与首页「Q」入口相同后台）

## 脚本摘要

| 命令 | 说明 |
|------|------|
| `npm run dev` | Vite 开发服务器（端口 3000） |
| `npm run dev:api` | Express API（默认 8787） |
| `npm run build` | 构建前端 |
| `npm run lint` | `tsc --noEmit` |
| `npm run db:seed` | 种子数据 |
