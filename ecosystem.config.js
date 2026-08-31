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
        NODE_OPTIONS: '--max-old-space-size=512',
      },
      max_memory_restart: '650M',
      autorestart: true,
    },
  ],
};
