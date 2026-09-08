/**
 * Cache Freshness Contract (ISSUE-008)
 *
 * Defines logical freshness states for market-tools precomputed reports:
 * - FRESH: Valid report matching the latest canonical trading date in DailyOhlcv (or weekend/holiday hold).
 * - STALE: Report exists, but a newer DailyOhlcv trading date has been ingested into the database,
 *          or the report is older than the max freshness window. Served safely to read requests while
 *          background precompute refreshes the cache.
 * - PENDING: No report exists (cold cache after restart/fresh deploy). Returns a deterministic stub.
 */

import { cache } from '@/lib/redis';

/** 7-day safety TTL for Redis storage (604,800 seconds) — prevents weekend cold-cache expiration */
export const MARKET_TOOLS_CACHE_TTL_SEC = 7 * 24 * 3600;

/** In-memory cache validity (7 days in milliseconds) */
export const MARKET_TOOLS_CACHE_TTL_MS = MARKET_TOOLS_CACHE_TTL_SEC * 1000;

/** Redis key storing the latest ingested DailyOhlcv date known to the system */
export const LATEST_INGESTED_DATE_KEY = 'market_tools:latest_ingested_date';

export type CacheFreshnessStatus = 'FRESH' | 'STALE' | 'PENDING';

export interface FreshnessCheckOptions {
  reportDate?: string | null | undefined;
  latestTradingDate?: string | null | undefined;
  reportComputedTime?: number | undefined;
  now?: number | undefined;
  maxAgeMs?: number | undefined;
}

/**
 * Evaluates whether a cached market-tools report is FRESH, STALE, or PENDING.
 *
 * Rules:
 * 1. If reportDate is absent or report is explicitly pending -> PENDING
 * 2. If latestTradingDate is provided and reportDate < latestTradingDate -> STALE
 * 3. If elapsed time since computation exceeds maxAgeMs (default: 7 days) -> STALE
 * 4. Otherwise -> FRESH
 */
export function evaluateReportFreshness(options: FreshnessCheckOptions): CacheFreshnessStatus {
  const {
    reportDate,
    latestTradingDate,
    reportComputedTime,
    now = Date.now(),
    maxAgeMs = MARKET_TOOLS_CACHE_TTL_MS,
  } = options;

  if (!reportDate) {
    return 'PENDING';
  }

  // If a newer trading date has been ingested into DailyOhlcv, this cached report is STALE
  if (latestTradingDate && reportDate < latestTradingDate) {
    return 'STALE';
  }

  // If the report exceeds maximum retention age
  if (reportComputedTime && now - reportComputedTime > maxAgeMs) {
    return 'STALE';
  }

  return 'FRESH';
}

/**
 * Records a newly ingested trading date in Redis without triggering an expensive compute.
 * Marks existing caches as logically STALE relative to this new date.
 */
export async function markMarketToolsCacheStale(newTradingDate: string): Promise<void> {
  try {
    await cache.set(LATEST_INGESTED_DATE_KEY, newTradingDate, MARKET_TOOLS_CACHE_TTL_SEC);
  } catch (err) {
    console.warn('[CacheFreshness] Failed to record latest ingested date in Redis:', err);
  }
}
