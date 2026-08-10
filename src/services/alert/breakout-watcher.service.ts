import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { env } from '@/config/env';

const MIN_BREAKOUT_ALERT_SCORE = 75;

/** Minimum gap between two alerts for the same symbol+kind (default 4 hours = one intraday session). */
const BREAKOUT_ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export type BreakoutAlertKind = 'BREAKOUT' | 'BREAKDOWN';

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
  /** Which signal triggered this alert row (set by detectNewBreakouts). */
  alertKind?: BreakoutAlertKind;
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
          data: { hadBreakout: true, lastAlerted: new Date() },
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
                data: { hadBreakout: true, lastAlerted: new Date() },
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

    if (!isNewAlert && !hasSignalNow) {
      try {
        await prisma.breakoutAlertState.updateMany({
          where: { symbol: claimKey, hadBreakout: true },
          data: { hadBreakout: false },
        });
      } catch (err) {
        console.warn(
          `[BreakoutWatcher] Could not clear ${kind} state for ${result.symbol}:`,
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
