// agent-proxy —— staging 进程配置
// 部署模型：把 agent-proxy 代码部署到【独立的 staging 目录】，在该目录放一份
// staging 的 .env（PORT=4003、SUPABASE_URL=staging、SUPABASE_SERVICE_KEY=staging service_role、
// SESSION_SECRET=与 db-proxy-staging 一致、LLM_API_KEY 等）。
// service_role / LLM_API_KEY 等密钥【只在服务器的 .env 里】，绝不进 git。
// 启动：pm2 start ecosystem.staging.config.js
module.exports = {
  apps: [
    {
      name: 'agent-proxy-staging',
      script: './server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: { NODE_ENV: 'production' },
      error_file: '/root/logs/agent-proxy-staging-error.log',
      out_file: '/root/logs/agent-proxy-staging-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
