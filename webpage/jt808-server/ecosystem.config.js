function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  apps: [
    {
      name: 'jt808',
      script: './index.js',
      cwd: '/root/jt808-server',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '8808',
        SUPABASE_URL: requiredEnv('SUPABASE_URL'),
        SUPABASE_KEY: requiredEnv('SUPABASE_KEY'),
      },
      error_file: '/root/logs/jt808-error.log',
      out_file: '/root/logs/jt808-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
