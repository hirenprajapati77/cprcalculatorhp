import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().optional(),
  
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_GROUP_CHAT_ID: z.string().optional(),
  
  FYERS_APP_ID: z.string().optional(),
  FYERS_SECRET_ID: z.string().optional(),
  FYERS_REDIRECT_URL: z.string().optional(),
  FYERS_AUTH_PROXY_URL: z.string().url().optional(),
  
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  APP_ACCESS_TOKEN: z.string().optional(),
  
  APP_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_ENABLE_DEBUG_PANEL: z.string().optional(),
  
  CACHE_PROVIDER: z.enum(['redis', 'memory']).default('memory'),
  MARKET_DATA_MODE: z.string().default('LIVE'),
  
  // Optional tuning parameters with reasonable defaults
  BTST_BYPASS_WINDOW: z.string().default('false'),
  YAHOO_BATCH_SIZE: z.coerce.number().default(50),
  YAHOO_MAX_RETRIES: z.coerce.number().default(3),
  
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  
  ENABLE_QUEUE: z.string().default('false'),
  SCAN_QUEUE_THRESHOLD: z.coerce.number().default(50),
  
  HISTORICAL_MODE: z.string().optional(),
  BACKTEST_EXECUTION_MODE: z.string().optional(),
  EXECUTION_MODE: z.string().optional(),
  RETENTION_DRY_RUN: z.string().optional(),
  RETENTION_LIMIT: z.coerce.number().optional(),
  SAVE_IGNORE_SIGNALS: z.string().optional(),
  ENABLE_EXPERIMENTAL_CPR_QUALITY: z.string().optional(),
  CPR_WEIGHT: z.coerce.number().optional(),
  
  APP_VERSION: z.string().optional(),
  BUILD_TIMESTAMP: z.string().optional(),
  NEXT_RUNTIME: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
});

// Validate process.env at startup
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  throw new Error('Invalid environment variables');
}

if (parsedEnv.data.NODE_ENV === 'production' && !parsedEnv.data.APP_ACCESS_TOKEN) {
  console.error('❌ FATAL: APP_ACCESS_TOKEN is required in production environment to prevent unauthenticated API access.');
  throw new Error('Missing APP_ACCESS_TOKEN in production');
}

export const env = parsedEnv.data;
