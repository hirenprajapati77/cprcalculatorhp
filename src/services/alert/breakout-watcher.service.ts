import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { env } from '@/config/env';

const MIN_BREAKOUT_ALERT_SCORE = 75;

/** Minimum gap between two alerts for the same symbol (default 4 hours = one intraday session). */
const BREAKOUT_ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

/** Number of consecutive scan cycles a breakout signal must be absent before resetting alert state. */
const BREAKOUT_MISS_DEBOUNCE_THRESHOLD = 2;

export interface BreakoutScanResult {
  symbol: string;
  signals: string[];
  ltp: number;
  entry: number;
  sl: number;
  target: number;
  rr: string;
  score: number;
  sector: string;
  eventRiskScore?: number;
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  );
}

export class BreakoutWatcherService {
  /**
   * Detects symbols that are NEWLY showing a BREAKOUT signal (i.e. they didn't
   * have it on the previous scan but do now). Symbols that already had BREAKOUT
   * on the last scan are NOT returned — deduplication prevents spam.
   */
  static async detectNewBreakouts(
    scanResults: BreakoutScanResult[]
  ): Promise<BreakoutScanResult[]> {
    const newBreakouts: BreakoutScanResult[] = [];

    for (const result of scanResults) {
      const hasBreakoutNow = result.signals.includes('BREAKOUT');
      
      if (hasBreakoutNow && result.score < MIN_BREAKOUT_ALERT_SCORE) {
        console.log(`[BreakoutWatcher] Near-miss: ${result.symbol} has BREAKOUT signal at score ${result.score} (threshold ${MIN_BREAKOUT_ALERT_SCORE})`);
      }

      if (hasBreakoutNow && (result.eventRiskScore ?? 0) >= 80) {
        console.log(`[BreakoutWatcher] Suppressing alert for ${result.symbol} due to high event risk: ${result.eventRiskScore}`);
      }

      const hasSectorDivergence = result.signals.includes('SECTOR_DIVERGENCE');
      const sectorFilterLive = env.SECTOR_FILTER_MODE === 'live';
      if (hasBreakoutNow && hasSectorDivergence) {
        console.log(
          `[BreakoutWatcher] ${result.symbol} flagged SECTOR_DIVERGENCE` +
          (sectorFilterLive ? ' — suppressing alert (live mode).' : ' — shadow mode, alert not suppressed.')
        );
      }

      const qualifiesForAlert =
        hasBreakoutNow && result.score >= MIN_BREAKOUT_ALERT_SCORE && (result.eventRiskScore ?? 0) < 80 &&
        !(hasSectorDivergence && sectorFilterLive);

      let stateReadFailed = false;
      let isNewAlert = false;

      if (qualifiesForAlert) {
        try {
          const cooldownCutoff = new Date(Date.now() - BREAKOUT_ALERT_COOLDOWN_MS);

          // Edge-trigger claim: alert only when hadBreakout is currently false
          // (signal was absent last scan — true new breakout episode). Continuous
          // BREAKOUT while hadBreakout stays true does NOT re-alert, even after the
          // 4h cooldown. Cooldown only applies when the signal dropped (hadBreakout
          // cleared) and then reappears — preventing flicker spam within 4 hours.
          const claim = await prisma.breakoutAlertState.updateMany({
            where: {
              symbol: result.symbol,
              hadBreakout: false,
              OR: [
                { lastAlerted: null },
                { lastAlerted: { lt: cooldownCutoff } },
              ],
            },
            data: { hadBreakout: true, lastAlerted: new Date(), missCount: 0 },
          });

          if (claim.count === 1) {
            isNewAlert = true;
          } else {
            try {
              await prisma.breakoutAlertState.create({
                data: {
                  symbol: result.symbol,
                  hadBreakout: true,
                  lastAlerted: new Date(),
                  missCount: 0,
                },
              });
              isNewAlert = true;
            } catch (createErr) {
              if (isUniqueConstraintError(createErr)) {
                const retryClaim = await prisma.breakoutAlertState.updateMany({
                  where: {
                    symbol: result.symbol,
                    hadBreakout: false,
                    OR: [
                      { lastAlerted: null },
                      { lastAlerted: { lt: cooldownCutoff } },
                    ],
                  },
                  data: { hadBreakout: true, lastAlerted: new Date(), missCount: 0 },
                });
                isNewAlert = retryClaim.count === 1;
              } else {
                throw createErr;
              }
            }
          }

          if (!isNewAlert && qualifiesForAlert) {
            // Check if suppressed by cooldown (for logging)
            const state = await prisma.breakoutAlertState.findUnique({
              where: { symbol: result.symbol },
              select: { lastAlerted: true, hadBreakout: true },
            });
            if (state?.lastAlerted && state.lastAlerted > cooldownCutoff) {
              console.log(
                `[BreakoutWatcher] Cooldown suppressed repeat alert for ${result.symbol} ` +
                `(last alerted ${state.lastAlerted.toISOString()}, cooldown ${BREAKOUT_ALERT_COOLDOWN_MS / 3600000}h)`
              );
            }
          }
        } catch (err) {
          stateReadFailed = true;
          console.warn(
            `[BreakoutWatcher] Could not claim state for ${result.symbol}:`,
            err
          );
        }
      }

      if (isNewAlert && !stateReadFailed) {
        newBreakouts.push(result);
      }

      if (hasBreakoutNow) {
        try {
          await prisma.breakoutAlertState.updateMany({
            where: { symbol: result.symbol, missCount: { gt: 0 } },
            data: { missCount: 0 },
          });
        } catch (err) {
          console.warn(
            `[BreakoutWatcher] Could not reset missCount for ${result.symbol}:`,
            err
          );
        }
      }

      if (!isNewAlert && !hasBreakoutNow) {
        try {
          const state = await prisma.breakoutAlertState.findUnique({
            where: { symbol: result.symbol },
            select: { hadBreakout: true, missCount: true },
          });

          if (state && state.hadBreakout) {
            const newMissCount = state.missCount + 1;
            if (newMissCount >= BREAKOUT_MISS_DEBOUNCE_THRESHOLD) {
              await prisma.breakoutAlertState.update({
                where: { symbol: result.symbol },
                data: { hadBreakout: false, missCount: 0 },
              });
              console.log(
                `[BreakoutWatcher] Cleared breakout state for ${result.symbol} after ${newMissCount} consecutive scan misses (threshold ${BREAKOUT_MISS_DEBOUNCE_THRESHOLD}).`
              );
            } else {
              await prisma.breakoutAlertState.update({
                where: { symbol: result.symbol },
                data: { missCount: newMissCount },
              });
              console.log(
                `[BreakoutWatcher] Recorded scan miss for active breakout ${result.symbol} (missCount: ${newMissCount}/${BREAKOUT_MISS_DEBOUNCE_THRESHOLD}). Cooldown active.`
              );
            }
          }
        } catch (err) {
          console.warn(
            `[BreakoutWatcher] Could not update breakout miss state for ${result.symbol}:`,
            err
          );
        }
      }
    }

    return newBreakouts;
  }

  /**
   * Undo claims when Telegram delivery fails so the next scan can re-alert.
   * Mirrors BTST alert claim rollback — without this, a failed send silences
   * the symbol for the full cooldown window.
   */
  static async releaseClaims(symbols: string[]): Promise<void> {
    if (symbols.length === 0) return;
    try {
      await prisma.breakoutAlertState.updateMany({
        where: { symbol: { in: symbols } },
        data: { hadBreakout: false, lastAlerted: null },
      });
    } catch (err) {
      console.error(
        `[BreakoutWatcher] Failed to release claims for ${symbols.join(',')}:`,
        err
      );
    }
  }

  static async resetDailyState(): Promise<void> {
    const { isMarketOpen } = await import('@/lib/market-hours');
    if (isMarketOpen()) {
      console.warn('[BreakoutWatcher] Aborting daily state reset: market is currently open!');
      return;
    }
    await prisma.breakoutAlertState.updateMany({
      data: { hadBreakout: false },
    });
    console.log(
      '[BreakoutWatcher] Daily state reset complete — all hadBreakout flags cleared.'
    );
  }
}
