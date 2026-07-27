module.exports = {
  apps: [
    {
      name: 'cpr-pro',
      script: '.next/standalone/server.js',
      cwd: '/home/ubuntu/cpr-calculator-platform',
      env: {
        NEXT_PUBLIC_BASE_URL: 'http://129.159.230.41',
        APP_BASE_URL: 'http://129.159.230.41',
        NODE_ENV: 'production',
        RATE_LIMIT_MAX: '100',
        RATE_LIMIT_WINDOW_MS: '60000',
        MARKET_DATA_MODE: 'live',
        CACHE_PROVIDER: 'redis',
        BACKTEST_EXECUTION_MODE: 'sync',
        BTST_BYPASS_WINDOW: 'true',
        RETENTION_DRY_RUN: 'true',
        HISTORICAL_MODE: 'live'
      }
    }
  ]
};
