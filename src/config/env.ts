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
  PROXY_SHARED_SECRET: z.string().optional(),
  
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

  /**
   * Market session profile. CONTINUOUS = exact current production clocks (default).
   * CLOSING_AUCTION = SEBI CAS clocks (F&O cash continuous ends 15:15; official close ~15:35).
   * CAS is exchange-live from 2026-08-03 — flip only after Production Validation checklist.
   * Unknown values fall through to CONTINUOUS via resolveMarketProfile.
   */
  MARKET_PROFILE: z
    .string()
    .default('CONTINUOUS')
    .transform((v) => v.trim().toUpperCase()),
  
  // Optional tuning parameters with reasonable defaults
  BTST_BYPASS_WINDOW: z.string().default('false'),
  YAHOO_BATCH_SIZE: z.coerce.number().default(50),
  YAHOO_MAX_RETRIES: z.coerce.number().default(3),
  YAHOO_REQUEST_TIMEOUT_MS: z.coerce.number().default(12000),
  FYERS_REQUEST_TIMEOUT_MS: z.coerce.number().default(10000),
  PROVIDER_ERROR_LOG_COOLDOWN_MS: z.coerce.number().default(300000),
  
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  
  ENABLE_QUEUE: z.string().default('false'),
  SCAN_QUEUE_THRESHOLD: z.coerce.number().default(50),
  CPR_SCAN_INTERVAL_MINUTES: z.coerce.number().default(5),
  
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

  /**
   * VPA confirmation layer.
   * Shadow by default: VPA_SHADOW_MODE=true is a master kill-switch — live influence
   * requires VPA_SHADOW_MODE=false AND the specific VPA_LIVE_* flag.
   */
  VPA_ENABLED: z.string().default('true'),
  VPA_SHADOW_MODE: z.string().default('true'),
  VPA_LIVE_CONFIDENCE: z.string().default('false'),
  VPA_LIVE_GATES: z.string().default('false'),
  /**
   * Sector Divergence filter. 'shadow' = tag stocks SECTOR_DIVERGENCE and log what
   * would be suppressed, but never block alerts/journal. 'live' = actually gate
   * Telegram breakout alerts and CPR Journal auto-logging behind the tag.
   */
  SECTOR_FILTER_MODE: z.enum(['shadow', 'live']).default('shadow'),
  /**
   * Max signals the daily CPR journal will auto-log, ranked by score desc.
   * Must be a positive integer: 0 would silently disable journaling, a
   * negative value flips Prisma `take` to "from the end" (lowest scores),
   * and a float makes Prisma throw at runtime.
   */
  CPR_JOURNAL_MAX_SIGNALS: z.coerce.number().int().min(1).default(5),
  VPA_COMPONENT_RVOL: z.string().default('true'),
  VPA_COMPONENT_CLV: z.string().default('true'),
  VPA_COMPONENT_EFFORT: z.string().default('true'),
  VPA_COMPONENT_BREAKOUT: z.string().default('true'),
  VPA_COMPONENT_CLIMAX: z.string().default('true'),
  VPA_COMPONENT_NO_DEMAND_SUPPLY: z.string().default('true'),
  VPA_RVOL_STRONG: z.coerce.number().optional(),
  VPA_RVOL_GOOD: z.coerce.number().optional(),
  VPA_RVOL_WEAK: z.coerce.number().optional(),
  
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
