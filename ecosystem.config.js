module.exports = {
  apps: [
    {
      name: 'cpr-platform',
      script: 'server-starter.js',
      cwd: '/home/ubuntu/cpr-calculator-platform',
      // NOTE: keeping exec_mode: 'fork' (single process) intentionally.
      // The scheduler uses in-process Redis claim state and PM2 memory restart
      // semantics that would break under cluster mode (multiple Node.js processes
      // sharing the same port but not sharing in-process Map/state).
      // B18 fix: add explicit log file paths so PM2 log rotation and shipping works.
      out_file: '/home/ubuntu/cpr-calculator-platform/logs/out.log',
      error_file: '/home/ubuntu/cpr-calculator-platform/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NODE_OPTIONS: '--max-old-space-size=384',
      },
      // H-18 fix: keep Node heap (384M) and RSS (480M) bounded so total system memory
      // stays comfortably under 1GB VM limits alongside PostgreSQL (~180M) and Redis (~60M)
      max_memory_restart: '480M',
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 2000,
      exp_backoff_restart_delay: 2000,
    },
  ],
};
