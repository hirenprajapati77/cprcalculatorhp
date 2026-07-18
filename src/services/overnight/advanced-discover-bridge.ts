/**
 * Phase H engine bridge — Option (a):
 * BtstService.discover delegates here so live discovery uses OvernightService
 * (Advanced) as the single source of truth. Simple evaluateOvernight remains
 * for backtests / V2 shadow only.
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
