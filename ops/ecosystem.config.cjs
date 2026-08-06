/**
 * PM2 config for Oracle Cloud free tier (~1 GB RAM).
 * Caps Node heap and restarts before the process starves Postgres/Redis.
 */
module.exports = {
  apps: [
    {
      name: 'cpr-platform',
      script: 'server.js',
      cwd: '/home/ubuntu/cpr-calculator-platform/.next/standalone',
      node_args: '--max-old-space-size=384',
      max_memory_restart: '450M',
      exp_backoff_restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
