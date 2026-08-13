import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { env } from '@/config/env';
import type { OptionSuggestion } from '../option-suggestion.service';
import { evaluateCprSetupPriceStaleness } from '@/services/alert/breakout-price-gate';

const MIN_BREAKOUT_ALERT_SCORE = 75;

/** Minimum gap between two alerts for the same symbol+kind (default 4 hours = one intraday session). */
const BREAKOUT_ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export type BreakoutAlertKind = 'BREAKOUT' | 'BREAKDOWN';
/** Number of consecutive scan cycles a signal must be absent before resetting alert state. */
const BREAKOUT_MISS_DEBOUNCE_THRESHOLD = 2;

export interface BreakoutScanResult {
  symbol: string;
  signals: string[];
  ltp: number;
  entry: number;
  sl: number;
  target: number;
  rr: string;
  target2?: number | null;
  rr2?: string | null;
  score: number;
  sector: string;
  classification?: string;
  eventRiskScore?: number;
  /** Today's observed high (from scan MarketStockData) — used by pre-send price gate. */
  high?: number;
  /** Today's observed low (from scan MarketStockData) — used by pre-send price gate. */
  low?: number;
  open?: number;
  previousClose?: number;
  /** Which signal triggered this alert row (set by detectNewBreakouts). */
  alertKind?: BreakoutAlertKind;
  /** Pre-fetched by breakout-alert.pipeline before Telegram send (optional). */
  optionSuggestion?: OptionSuggestion;
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002'
  );
}

/** Claim key so BREAKOUT and BREAKDOWN can coexist for the same ticker. */
export function breakoutAlertClaimKey(symbol: string, kind: BreakoutAlertKind): string {
  return `${symbol}:${kind}`;
}

export class BreakoutWatcherService {
  /**
   * Detects symbols newly showing BREAKOUT or BREAKDOWN (edge-trigger per kind).
   * Claim keys are `symbol:BREAKOUT` / `symbol:BREAKDOWN` so both directions can alert.
   */
  static async detectNewBreakouts(
    scanResults: BreakoutScanResult[]
  ): Promise<BreakoutScanResult[]> {
    const newAlerts: BreakoutScanResult[] = [];

    for (const result of scanResults) {
      for (const kind of ['BREAKOUT', 'BREAKDOWN'] as const) {
        const alert = await BreakoutWatcherService.evaluateKind(result, kind);
        if (alert) newAlerts.push(alert);
      }
    }

    return newAlerts;
  }

  private static async evaluateKind(
    result: BreakoutScanResult,
    kind: BreakoutAlertKind
  ): Promise<BreakoutScanResult | null> {
    const hasSignalNow = result.signals.includes(kind);
    const claimKey = breakoutAlertClaimKey(result.symbol, kind);

    if (hasSignalNow && result.score < MIN_BREAKOUT_ALERT_SCORE) {
      console.log(
        `[BreakoutWatcher] Near-miss: ${result.symbol} has ${kind} signal at score ${result.score} (threshold ${MIN_BREAKOUT_ALERT_SCORE})`
      );
    }

    if (hasSignalNow && (result.eventRiskScore ?? 0) >= 80) {
      console.log(
        `[BreakoutWatcher] Suppressing ${kind} alert for ${result.symbol} due to high event risk: ${result.eventRiskScore}`
      );
    }

    const hasSectorDivergence = result.signals.includes('SECTOR_DIVERGENCE');
    const sectorFilterLive = env.SECTOR_FILTER_MODE === 'live';
    if (hasSignalNow && hasSectorDivergence) {
      console.log(
        `[BreakoutWatcher] ${result.symbol} ${kind} flagged SECTOR_DIVERGENCE` +
        (sectorFilterLive ? ' — suppressing alert (live mode).' : ' — shadow mode, alert not suppressed.')
      );
    }

    const qualifiesForAlert =
      hasSignalNow &&
      result.score >= MIN_BREAKOUT_ALERT_SCORE &&
      (result.eventRiskScore ?? 0) < 80 &&
      !(hasSectorDivergence && sectorFilterLive);

    let stateReadFailed = false;
    let isNewAlert = false;

    if (qualifiesForAlert) {
      try {
        const cooldownCutoff = new Date(Date.now() - BREAKOUT_ALERT_COOLDOWN_MS);

        const claim = await prisma.breakoutAlertState.updateMany({
          where: {
            symbol: claimKey,
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
                symbol: claimKey,
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
                  symbol: claimKey,
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
          const state = await prisma.breakoutAlertState.findUnique({
            where: { symbol: claimKey },
            select: { lastAlerted: true, hadBreakout: true },
          });
          if (state?.lastAlerted && state.lastAlerted > cooldownCutoff) {
            console.log(
              `[BreakoutWatcher] Cooldown suppressed repeat ${kind} alert for ${result.symbol} ` +
              `(last alerted ${state.lastAlerted.toISOString()}, cooldown ${BREAKOUT_ALERT_COOLDOWN_MS / 3600000}h)`
            );
          }
        }
      } catch (err) {
        stateReadFailed = true;
        console.warn(
          `[BreakoutWatcher] Could not claim ${kind} state for ${result.symbol}:`,
          err
        );
      }
    }

    if (hasSignalNow) {
      try {
        if (qualifiesForAlert) {
          // Fully qualifying: reset miss counter
          await prisma.breakoutAlertState.updateMany({
            where: { symbol: claimKey, missCount: { gt: 0 } },
            data: { missCount: 0 },
          });
        } else {
          // M3 fix: signal present but score/event risk prevents alert.
          // Increment missCount so a persistent low-score stock eventually
          // clears hadBreakout and can re-alert when score recovers.
          const state = await prisma.breakoutAlertState.findUnique({
            where: { symbol: claimKey },
            select: { hadBreakout: true, missCount: true },
          });
          if (state?.hadBreakout) {
            const newMissCount = state.missCount + 1;
            if (newMissCount >= BREAKOUT_MISS_DEBOUNCE_THRESHOLD) {
              await prisma.breakoutAlertState.update({
                where: { symbol: claimKey },
                data: { hadBreakout: false, missCount: 0 },
              });
              console.log(
                `[BreakoutWatcher] Cleared ${kind} state for ${result.symbol} after ` +
                `${newMissCount} low-score misses (score=${result.score}).`
              );
            } else {
              await prisma.breakoutAlertState.update({
                where: { symbol: claimKey },
                data: { missCount: newMissCount },
              });
            }
          }
        }
      } catch (err) {
        console.warn(
          `[BreakoutWatcher] Could not update ${kind} missCount for ${result.symbol}:`,
          err
        );
      }
    }

    if (!isNewAlert && !hasSignalNow) {
      try {
        const state = await prisma.breakoutAlertState.findUnique({
          where: { symbol: claimKey },
          select: { hadBreakout: true, missCount: true },
        });
        if (state && state.hadBreakout) {
          const newMissCount = state.missCount + 1;
          if (newMissCount >= BREAKOUT_MISS_DEBOUNCE_THRESHOLD) {
            await prisma.breakoutAlertState.update({
              where: { symbol: claimKey },
              data: { hadBreakout: false, missCount: 0 },
            });
            console.log(
              `[BreakoutWatcher] Cleared ${kind} state for ${result.symbol} after ${newMissCount} misses (threshold ${BREAKOUT_MISS_DEBOUNCE_THRESHOLD}).`
            );
          } else {
            await prisma.breakoutAlertState.update({
              where: { symbol: claimKey },
              data: { missCount: newMissCount },
            });
            console.log(
              `[BreakoutWatcher] Recorded ${kind} miss for ${result.symbol} (${newMissCount}/${BREAKOUT_MISS_DEBOUNCE_THRESHOLD}).`
            );
          }
        }
      } catch (err) {
        console.warn(
          `[BreakoutWatcher] Could not update ${kind} miss state for ${result.symbol}:`,
          err
        );
      }
    }

    if (isNewAlert && !stateReadFailed) {
      return { ...result, alertKind: kind };
    }
    return null;
  }

  /**
   * Undo claims when Telegram delivery fails so the next scan can re-alert.
   * Accepts either bare symbols (legacy) or `symbol:KIND` claim keys.
   * Clears lastAlerted — used ONLY for never-delivered claims (Telegram failure).
   * For gate-suppressed claims use suppressClaims() to preserve the cooldown.
   */
  static async releaseClaims(symbolsOrKeys: string[]): Promise<void> {
    if (symbolsOrKeys.length === 0) return;
    const keys = new Set<string>();
    for (const s of symbolsOrKeys) {
      if (s.endsWith(':BREAKOUT') || s.endsWith(':BREAKDOWN')) {
        keys.add(s);
      } else {
        keys.add(breakoutAlertClaimKey(s, 'BREAKOUT'));
        keys.add(breakoutAlertClaimKey(s, 'BREAKDOWN'));
      }
    }
    try {
      await prisma.breakoutAlertState.updateMany({
        where: { symbol: { in: [...keys] } },
        data: { hadBreakout: false, lastAlerted: null },
      });
    } catch (err) {
      console.error(
        `[BreakoutWatcher] Failed to release claims for ${[...keys].join(',')}:`,
        err
      );
    }
  }

  /**
   * H1 fix: Suppress gate-rejected claims (VIX / price gate) while PRESERVING
   * lastAlerted so the 4-hour cooldown remains intact.
   *
   * Without this, releaseClaims() would null out lastAlerted, causing the
   * watcher to re-claim + re-suppress on every subsequent 5-min cron tick
   * for as long as VIX is elevated — producing thousands of DB writes/day.
   *
   * After the cooldown expires, detectNewBreakouts will see lastAlerted is
   * past the 4h window and allow the alert to be re-evaluated normally.
   */
  static async suppressClaims(symbolsOrKeys: string[]): Promise<void> {
    if (symbolsOrKeys.length === 0) return;
    const keys = new Set<string>();
    for (const s of symbolsOrKeys) {
      if (s.endsWith(':BREAKOUT') || s.endsWith(':BREAKDOWN')) {
        keys.add(s);
      } else {
        keys.add(breakoutAlertClaimKey(s, 'BREAKOUT'));
        keys.add(breakoutAlertClaimKey(s, 'BREAKDOWN'));
      }
    }
    try {
      await prisma.breakoutAlertState.updateMany({
        where: { symbol: { in: [...keys] } },
        // hadBreakout=false so next evaluate can re-claim; lastAlerted preserved
        // via NOT setting it — we only update hadBreakout.
        data: { hadBreakout: false },
      });
    } catch (err) {
      console.error(
        `[BreakoutWatcher] Failed to suppress claims for ${[...keys].join(',')}:`,
        err
      );
    }
  }

  /**
   * Clear hadBreakout for already-delivered alerts whose entry is now
   * gap-invalidated / extended, but keep lastAlerted so the 4h cooldown still
   * blocks an immediate re-spam. After cooldown, a pullback into the entry
   * zone can alert again; while still stale the pre-send gate suppresses.
   */
  static async releaseStaleDeliveredClaims(
    scanResults: BreakoutScanResult[]
  ): Promise<string[]> {
    const staleKeys: string[] = [];

    for (const r of scanResults) {
      for (const kind of ['BREAKOUT', 'BREAKDOWN'] as const) {
        if (!r.signals?.includes(kind)) continue;
        const direction = kind === 'BREAKDOWN' ? 'SHORT' : 'LONG';
        const verdict = evaluateCprSetupPriceStaleness({
          entry: r.entry,
          ltp: r.ltp,
          direction,
          ...(r.high != null ? { todayHigh: r.high } : {}),
          ...(r.low != null ? { todayLow: r.low } : {}),
          ...(r.previousClose != null ? { previousClose: r.previousClose } : {}),
          ...(r.open != null ? { open: r.open } : {}),
          symbol: r.symbol,
          sector: r.sector,
        });
        if (verdict.stale) {
          staleKeys.push(breakoutAlertClaimKey(r.symbol, kind));
        }
      }
    }

    if (staleKeys.length === 0) return [];

    try {
      const updated = await prisma.breakoutAlertState.updateMany({
        where: { symbol: { in: staleKeys }, hadBreakout: true },
        data: { hadBreakout: false },
      });
      if (updated.count > 0) {
        console.log(
          `[BreakoutWatcher] Released ${updated.count} stale-price delivered claim(s) ` +
            `(cooldown preserved): ${staleKeys.join(', ')}`
        );
      }
    } catch (err) {
      console.error(
        `[BreakoutWatcher] Failed to release stale delivered claims for ${staleKeys.join(',')}:`,
        err
      );
    }

    return staleKeys;
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
