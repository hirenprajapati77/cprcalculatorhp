import { cache } from '@/lib/redis';

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
 * Storage: Redis key `cpr:bullish_state:{SYMBOL}` with EOD TTL (28800 s = 8 h).
 *
 * Works with or without Redis (falls back to in-process memory via cache utility).
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
/** 8 hours — covers a full trading session. Keys auto-expire at night. */
const TTL_SECONDS = 28800;

export class BullishStateService {
  /**
   * Returns the Redis/memory cache key for a given symbol.
   */
  private static key(symbol: string): string {
    return `${KEY_PREFIX}${symbol.trim()}`;
  }

  /**
   * Retrieves the stored bullish/bearish state entry for a symbol, or null if none.
   */
  static async getState(symbol: string): Promise<BullishStateEntry | null> {
    const raw = await cache.get(this.key(symbol));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BullishStateEntry;
    } catch {
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
    type: 'BULLISH' | 'BEARISH'
  ): Promise<BullishStateEntry> {
    const existing = await this.getState(symbol);
    if (existing && existing.type === type) {
      // Same direction — preserve the original first-seen time (don't overwrite).
      return existing;
    }
    // New state or direction flip — record now.
    const entry: BullishStateEntry = {
      firstSeenAt: new Date().toISOString(),
      type,
    };
    await cache.set(this.key(symbol), JSON.stringify(entry), TTL_SECONDS);
    return entry;
  }

  /**
   * Clears the stored state (e.g., when condition becomes neutral / INSIDE CPR).
   */
  static async clearState(symbol: string): Promise<void> {
    await cache.del(this.key(symbol));
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
