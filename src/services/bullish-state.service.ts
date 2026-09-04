import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { getISTDateString } from '@/lib/market-hours';

/**
 * BullishStateService — Cross-Age Tracker
 *
 * Tracks the FIRST TIME a stock enters a bullish or bearish momentum state
 * during the current trading session. This allows signals to carry a "cross age"
 * (how many minutes since the setup first became valid), enabling the scanner to:
 *
 *  - Tag FRESH_SETUP  (<= 45 min) → high confidence, price hasn't extended yet
 *  - Tag MATURE_SETUP (45-90 min) → moderate confidence
 *  - Tag STALE_SETUP  (> 90 min)  → caution, much of the move may be done
 *
 * Storage: Postgres `DirectionSetupState` (durable across Redis flush / PM2 restart).
 * Redis key `cpr:bullish_state:{SYMBOL}` is a short-lived L1 mirror only — never
 * the source of truth (Oracle mem_watchdog may FLUSHDB off-hours).
 *
 * Design note: The caller (scanner.service.ts) determines direction via LTP vs today's
 * CPR bands (ltp > tc = BULLISH, ltp < bc = BEARISH). This service only
 * tracks how long that state has persisted — it does not itself evaluate
 * slope or momentum.
 */

export interface BullishStateEntry {
  /** ISO timestamp when the state was first detected this session. */
  firstSeenAt: string;
  /** 'BULLISH' or 'BEARISH'. */
  type: 'BULLISH' | 'BEARISH';
}

const KEY_PREFIX = 'cpr:bullish_state:';
/** Short L1 mirror — safe to lose; Postgres is authoritative. */
const REDIS_TTL_SECONDS = 3600;

export class BullishStateService {
  private static key(symbol: string, date: string): string {
    return `${KEY_PREFIX}${date}:${symbol.trim()}`;
  }

  private static normalizeType(type: string): 'BULLISH' | 'BEARISH' | null {
    if (type === 'BULLISH' || type === 'BEARISH') return type;
    return null;
  }

  /**
   * Retrieves the stored bullish/bearish state entry for a symbol, or null if none.
   */
  static async getState(symbol: string, date = getISTDateString()): Promise<BullishStateEntry | null> {
    const sym = symbol.trim();
    const redisKey = this.key(sym, date);

    try {
      const raw = await cache.get(redisKey);
      if (raw) {
        const parsed = JSON.parse(raw) as BullishStateEntry;
        if (this.normalizeType(parsed.type) && parsed.firstSeenAt) return parsed;
      }
    } catch {
      // fall through to Postgres
    }

    try {
      const row = await prisma.directionSetupState.findUnique({
        where: { symbol_date: { symbol: sym, date } },
      });
      if (!row) return null;
      const type = this.normalizeType(row.type);
      if (!type) return null;
      const entry: BullishStateEntry = {
        firstSeenAt: row.firstSeenAt.toISOString(),
        type,
      };
      try {
        await cache.set(redisKey, JSON.stringify(entry), REDIS_TTL_SECONDS);
      } catch {
        // non-fatal
      }
      return entry;
    } catch (err) {
      console.warn(`[BullishState] Postgres get failed for ${sym}:`, err);
      return null;
    }
  }

  /**
   * Records the current time as the "first seen" timestamp for the given state,
   * but ONLY if:
   *  - No state is stored yet, OR
   *  - The stored state TYPE differs (e.g., was BEARISH, now BULLISH → reset).
   *
   * This ensures we never overwrite a valid FRESH state with a later timestamp.
   */
  static async recordState(
    symbol: string,
    type: 'BULLISH' | 'BEARISH',
    date = getISTDateString()
  ): Promise<BullishStateEntry> {
    const sym = symbol.trim();
    const existing = await this.getState(sym, date);
    if (existing && existing.type === type) {
      return existing;
    }

    const firstSeenAt = new Date();
    const entry: BullishStateEntry = {
      firstSeenAt: firstSeenAt.toISOString(),
      type,
    };

    try {
      await prisma.directionSetupState.upsert({
        where: { symbol_date: { symbol: sym, date } },
        update: { type, firstSeenAt },
        create: { symbol: sym, date, type, firstSeenAt },
      });
    } catch (err) {
      console.warn(`[BullishState] Postgres upsert failed for ${sym}:`, err);
    }

    try {
      await cache.set(this.key(sym, date), JSON.stringify(entry), REDIS_TTL_SECONDS);
    } catch {
      // non-fatal
    }

    return entry;
  }

  /**
   * Clears the stored state (e.g., when condition becomes neutral / INSIDE CPR).
   */
  static async clearState(symbol: string, date = getISTDateString()): Promise<void> {
    const sym = symbol.trim();
    const cacheKey = this.key(sym, date);
    // H-13 fix: check cache first. If no prior directional state was recorded,
    // skip hitting Postgres with redundant DELETE queries for every inside-CPR stock.
    try {
      const existing = await cache.get(cacheKey);
      if (!existing) return;
      await cache.del(cacheKey);
    } catch {
      // If cache is down, proceed to DB cleanup as fallback
    }

    try {
      await prisma.directionSetupState.deleteMany({
        where: { symbol: sym, date },
      });
    } catch (err) {
      console.warn(`[BullishState] Postgres clear failed for ${sym}:`, err);
    }
  }

  /**
   * Returns the age of the current state in minutes, or null if no state stored.
   */
  static ageMinutes(entry: BullishStateEntry): number {
    const firstSeen = new Date(entry.firstSeenAt).getTime();
    return Math.floor((Date.now() - firstSeen) / 60000);
  }

  /**
   * Classifies a cross age into a freshness bucket.
   *   FRESH  : <= 45 min  → move is early, high confidence entry
   *   MATURE : 45-90 min  → move underway, moderate confidence
   *   STALE  : > 90 min   → much of the move may already be done
   */
  static freshness(ageMinutes: number): 'FRESH' | 'MATURE' | 'STALE' {
    if (ageMinutes <= 45) return 'FRESH';
    if (ageMinutes <= 90) return 'MATURE';
    return 'STALE';
  }
}
