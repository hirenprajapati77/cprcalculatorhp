/**
 * Phase H engine bridge — Option (a):
 * BtstService.discover delegates here so live discovery uses OvernightService
 * (Advanced) as the single source of truth. Simple evaluateOvernight remains
 * for backtests / V2 shadow only.
 *
 * Liquidity: OvernightService.discover hard-excludes avgVolume < 100k /
 * volumeRatio < 1.2 via EntryManagerService.evaluateEligibility (continue
 * before scoring). This bridge does NOT re-apply that gate.
 * Note: qualityBucket LOW_QUALITY is a separate flag for weaker tiers that
 * already passed eligibility — NOT excluded here; journal/Telegram keep
 * TRADEABLE only via selectTradableOvernightPicks / prisma filters.
 */
import type { BtstScoreResultEnriched } from '@/services/backtest/btst.service';
import { OvernightService } from '@/services/overnight/overnight.service';
import {
  overnightSignalToBtstUi,
  filterOvernightByUniverse,
  buildInsightsFromOvernight,
} from '@/services/overnight/overnight-ui-adapter';

export interface AdvancedDiscoverResult {
  results: BtstScoreResultEnriched[];
  insights: ReturnType<typeof buildInsightsFromOvernight>;
  coverage: {
    engine: 'advanced';
    degraded: boolean;
    universe: string;
    signalCount: number;
    overnightUniverseCount: number;
  };
}

export async function discoverViaAdvancedEngine(
  universe: string
): Promise<AdvancedDiscoverResult> {
  const overnightSignals = await OvernightService.discover('BOTH');
  const filtered = filterOvernightByUniverse(overnightSignals, universe);
  const results = filtered.map(overnightSignalToBtstUi);
  const insights = buildInsightsFromOvernight(filtered);

  return {
    results,
    insights,
    coverage: {
      engine: 'advanced',
      degraded: false,
      universe,
      signalCount: results.length,
      overnightUniverseCount: overnightSignals.length,
    },
  };
}
