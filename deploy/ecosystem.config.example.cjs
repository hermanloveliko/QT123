/**
 * PM2 生产环境示例（复制为 ecosystem.config.cjs 后按需修改）
 *
 * 用法：
 *   cd /path/to/project
 *   cp deploy/ecosystem.config.example.cjs ecosystem.config.cjs
 *   # 编辑 ecosystem.config.cjs：填写 env_production 下的变量
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save
 *
 * 注意：不要用 `npm run dev:api`（tsx watch）跑线上。
 */
module.exports = {
  apps: [
    {
      name: "qingtai-api",
      // 在“项目根目录”执行 pm2 start 时，cwd 用当前目录即可
      cwd: process.cwd(),
      script: "npm",
      args: "run start:api",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "10s",
      env_production: {
        NODE_ENV: "production",
        API_PORT: 8787,
        // 从服务器上的 .env 读取（dotenv），这里也可显式写入（二选一）
        // DATABASE_URL: "postgresql://USER:PASSWORD@127.0.0.1:5432/DBNAME?schema=public",
        // ADMIN_JWT_SECRET: "CHANGE_ME",
        // WEB_ORIGIN: "https://www.example.com",
        // WEB_ORIGINS: "https://example.com,https://www.example.com",
        // PUBLIC_APP_URL: "https://www.example.com",
        // DEEPSEEK_API_KEY: "",
      },
    },
  ],
};
