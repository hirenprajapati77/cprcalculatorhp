module.exports = {
  apps: [
    {
      name: 'cpr-platform',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
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
