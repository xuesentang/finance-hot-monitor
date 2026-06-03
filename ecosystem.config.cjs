// PM2 进程管理配置 — 腾讯云香港节点部署
module.exports = {
  apps: [
    {
      name: 'finance-hot-monitor',
      cwd: './server',
      script: 'dist/index.js',
      interpreter: 'node',
      // 内存限制：入门服务器通常 512MB-1GB，给 Node 留 300MB
      max_memory_restart: '300M',
      // 生产环境
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
      // 日志配置
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '../logs/pm2-error.log',
      out_file: '../logs/pm2-out.log',
      // 自动重启
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      // 优雅关闭
      kill_timeout: 15000,
      listen_timeout: 10000,
      // 崩溃重启间隔
      min_uptime: '30s',
    },
  ],
};
