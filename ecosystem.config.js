module.exports = {
  apps: [
    {
      name: 'cpr-platform',
      script: 'server-starter.js',
      cwd: '/home/ubuntu/cpr-calculator-platform',
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
