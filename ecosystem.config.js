module.exports = {
  apps: [
    {
      name: 'cpr-pro',
      script: '.next/standalone/server.js',
      cwd: '/home/ubuntu/cpr-calculator-platform',
      env: {
        DATABASE_URL: 'postgresql://postgres:postgrespassword@localhost:5432/cpr_pro?schema=public',
        NEXT_PUBLIC_BASE_URL: 'http://129.159.230.41',
        APP_BASE_URL: 'http://129.159.230.41',
        NODE_ENV: 'production',
        RATE_LIMIT_MAX: '100',
        RATE_LIMIT_WINDOW_MS: '60000',
        MARKET_DATA_MODE: 'live',
        CACHE_PROVIDER: 'redis',
        REDIS_URL: 'redis://127.0.0.1:6379',
        BACKTEST_EXECUTION_MODE: 'sync',
        BTST_BYPASS_WINDOW: 'true',
        RETENTION_DRY_RUN: 'true',
        FYERS_APP_ID: 'NUWRYFPBFL-100',
        FYERS_SECRET_ID: 'GL68ZZF8OS',
        FYERS_REDIRECT_URL: 'http://129.159.230.41/api/broker/fyers/callback',
        HISTORICAL_MODE: 'live',
        CRON_SECRET: 'cpr-prod-token-v2-2026',
        TOKEN_ENCRYPTION_KEY: 'cpr-pro-fyers-token-key-2026',
        APP_ACCESS_TOKEN: 'cpr-prod-token-v2-2026'
      }
    }
  ]
};
