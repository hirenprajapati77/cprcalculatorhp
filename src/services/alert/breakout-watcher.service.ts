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

      let hadBreakoutBefore = false;
      let stateReadFailed = false;
      try {
        const state = await prisma.breakoutAlertState.findUnique({
          where: { symbol: result.symbol }
        });
        hadBreakoutBefore = state?.hadBreakout ?? false;
      } catch (err) {
        stateReadFailed = true;
        console.warn(`[BreakoutWatcher] Could not read state for ${result.symbol}:`, err);
      }

      if (hasBreakoutNow && !hadBreakoutBefore && !stateReadFailed && result.score >= MIN_BREAKOUT_ALERT_SCORE) {
        // Transition: did NOT have BREAKOUT before → NOW has BREAKOUT → alert
        // Skipped entirely if the state read failed, to avoid false "new breakout"
        // spam caused by a DB error rather than a real signal transition.
        newBreakouts.push(result);
      }

      // Always update state to reflect current scan result.
      // We only lock the state (hadBreakout = true) if the signal is currently present AND
      // it either just fired a valid alert (score >= 75) OR was already locked previously.
      // This allows weak breakouts to wait for 75 without locking, and prevents threshold
      // oscillation spam (78 -> 71 -> 80) from firing multiple alerts as long as the signal itself never drops.
      try {
        const isNewAlert = hasBreakoutNow && !hadBreakoutBefore && !stateReadFailed && result.score >= MIN_BREAKOUT_ALERT_SCORE;
        const newLockState = hasBreakoutNow && (hadBreakoutBefore || result.score >= MIN_BREAKOUT_ALERT_SCORE);
        
        await prisma.breakoutAlertState.upsert({
          where: { symbol: result.symbol },
          create: {
            symbol: result.symbol,
            hadBreakout: newLockState,
            lastAlerted: isNewAlert ? new Date() : null
          },
          update: {
            hadBreakout: newLockState,
            ...(isNewAlert ? { lastAlerted: new Date() } : {})
          }
        });
      } catch (err) {
        console.warn(`[BreakoutWatcher] Could not update state for ${result.symbol}:`, err);
      }
    }

    return newBreakouts;
  }

  /**
   * Resets all hadBreakout flags to false.
   * Called daily before market open so that stocks which broke out yesterday
   * and break out again today generate a fresh alert (not permanently suppressed).
   */
  static async resetDailyState(): Promise<void> {
    await prisma.breakoutAlertState.updateMany({
      data: { hadBreakout: false }
    });
    console.log('[BreakoutWatcher] Daily state reset complete — all hadBreakout flags cleared.');
  }
}
