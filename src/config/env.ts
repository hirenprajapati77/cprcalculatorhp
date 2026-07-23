import { z } from 'zod';

/** Treat blank env values as unset so optional URL fields don't fail Zod `.url()`. */
export function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

const optionalUrl = z.preprocess(emptyStringToUndefined, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: optionalUrl,
  REDIS_URL: optionalUrl,
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().optional(),
  
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_GROUP_CHAT_ID: z.string().optional(),
  
  FYERS_APP_ID: z.string().optional(),
  FYERS_SECRET_ID: z.string().optional(),
  FYERS_REDIRECT_URL: z.string().optional(),
  FYERS_AUTH_PROXY_URL: optionalUrl,
  
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  /**
   * ⚠️ WARNING: If you change CRON_SECRET, you MUST also update the curl commands
   * in the production server's crontab (via `crontab -e`), otherwise background jobs
   * will fail with 401 Unauthorized.
   */
  CRON_SECRET: z.string().optional(),
  APP_ACCESS_TOKEN: z.string().optional(),
  
  APP_BASE_URL: optionalUrl,
  NEXT_PUBLIC_BASE_URL: optionalUrl,
  NEXT_PUBLIC_ENABLE_DEBUG_PANEL: z.string().optional(),
  
  CACHE_PROVIDER: z.enum(['redis', 'memory', 'auto']).default('auto'),
  // Normalize to lowercase so "LIVE"/"Live" still enable real Yahoo data
  MARKET_DATA_MODE: z.string().default('live').transform((v) => v.toLowerCase()),
  
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
  // Off by default: marketEvent has no writer yet, so an empty table would otherwise be
  // indistinguishable from "checked recently, found nothing" and force max event-risk on
  // every signal (see EventCalendarService). Flip to 'true' only once a real calendar
  // populator job exists and runs regularly.
  EVENT_CALENDAR_ENFORCE_FRESHNESS: z.string().default('false'),
  /**
   * DISPLAY-ONLY. Used for UI banners / health payloads (e.g. SHADOW vs LIVE label).
   * Does NOT gate any broker order placement — no real order-routing path exists
   * under src/app/api yet. Do not treat this as an execution safety control.
   */
  EXECUTION_MODE: z.string().optional(),
  RETENTION_DRY_RUN: z.string().optional(),
  RETENTION_LIMIT: z.coerce.number().optional(),
  SAVE_IGNORE_SIGNALS: z.string().optional(),
  CPR_WEIGHT: z.coerce.number().optional(),
  
  APP_VERSION: z.string().optional(),
  BUILD_TIMESTAMP: z.string().optional(),
  NEXT_RUNTIME: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
});

/** Exported for unit tests — same schema as startup validation. */
export const envSchemaForTests = envSchema;

// Validate process.env at startup
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  throw new Error('Invalid environment variables');
}

/**
 * Production requires APP_ACCESS_TOKEN. Skip during `next build`
 * (NODE_ENV=production but NEXT_PHASE=phase-production-build) so CI/deploy
 * packaging can succeed without runtime secrets present on the build host.
 */
const isProductionBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
if (
  parsedEnv.data.NODE_ENV === 'production' &&
  !isProductionBuildPhase &&
  !parsedEnv.data.APP_ACCESS_TOKEN?.trim()
) {
  throw new Error(
    'APP_ACCESS_TOKEN is required in production. Set it in the server .env before starting.'
  );
}

/**
 * Production requires DATABASE_URL. Fail fast at startup rather than
 * throwing a cryptic PrismaClientInitializationError on the first DB query.
 */
if (
  parsedEnv.data.NODE_ENV === 'production' &&
  !isProductionBuildPhase &&
  !parsedEnv.data.DATABASE_URL
) {
  throw new Error(
    'DATABASE_URL is required in production. Set it in the server .env before starting.'
  );
}

export const env = parsedEnv.data;
