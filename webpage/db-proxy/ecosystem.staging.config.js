// db-proxy —— staging 进程配置
// 部署模型：把 db-proxy 代码部署到【独立的 staging 目录】，在该目录放一份
// staging 的 .env（PORT=4002、SUPABASE_URL=staging、SUPABASE_SERVICE_KEY=staging service_role 等）。
// service_role 等密钥【只在服务器的 .env 里】，绝不进 git。
// 启动：pm2 start ecosystem.staging.config.js
module.exports = {
  apps: [
    {
      name: 'db-proxy-staging',
      script: './server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      // 连接配置（SUPABASE_URL / SUPABASE_SERVICE_KEY / PORT=4002 / ALLOWED_ORIGINS）
      // 由同目录的 staging .env 提供（dotenv 加载）；此处只声明运行模式。
      env: { NODE_ENV: 'production' },
      error_file: '/root/logs/db-proxy-staging-error.log',
      out_file: '/root/logs/db-proxy-staging-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
