import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const MIN_BREAKOUT_ALERT_SCORE = 75;

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
      const qualifiesForAlert =
        hasBreakoutNow && result.score >= MIN_BREAKOUT_ALERT_SCORE;

      let stateReadFailed = false;
      let isNewAlert = false;

      if (qualifiesForAlert) {
        try {
          // Attempt an atomic claim. If no row exists yet for the symbol, the updateMany count is 0,
          // and we safely fall back to creating the row. If unique constraint fails during concurrent
          // creation, we catch P2002 and run updateMany again to safely settle the claim state.
          const claim = await prisma.breakoutAlertState.updateMany({
            where: { symbol: result.symbol, hadBreakout: false },
            data: { hadBreakout: true, lastAlerted: new Date() },
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
                },
              });
              isNewAlert = true;
            } catch (createErr) {
              if (isUniqueConstraintError(createErr)) {
                const retryClaim = await prisma.breakoutAlertState.updateMany({
                  where: { symbol: result.symbol, hadBreakout: false },
                  data: { hadBreakout: true, lastAlerted: new Date() },
                });
                isNewAlert = retryClaim.count === 1;
              } else {
                throw createErr;
              }
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

      if (!isNewAlert) {
        let hadBreakoutBefore = false;
        if (!stateReadFailed) {
          try {
            const state = await prisma.breakoutAlertState.findUnique({
              where: { symbol: result.symbol },
            });
            hadBreakoutBefore = state?.hadBreakout ?? false;
          } catch (err) {
            stateReadFailed = true;
            console.warn(
              `[BreakoutWatcher] Could not read state for ${result.symbol}:`,
              err
            );
          }
        }

        const newLockState =
          hasBreakoutNow &&
          (hadBreakoutBefore || result.score >= MIN_BREAKOUT_ALERT_SCORE);

        try {
          await prisma.breakoutAlertState.upsert({
            where: { symbol: result.symbol },
            create: {
              symbol: result.symbol,
              hadBreakout: newLockState,
              lastAlerted: null,
            },
            update: {
              hadBreakout: newLockState,
            },
          });
        } catch (err) {
          console.warn(
            `[BreakoutWatcher] Could not update state for ${result.symbol}:`,
            err
          );
        }
      }
    }

    return newBreakouts;
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
