/**
 * M-5: Overnight Scan Funnel Observability Metrics
 *
 * Tracks funnel drop counts across the Overnight / BTST / STBT scan pipeline
 * so operators can distinguish data pipeline dropouts from strict market filter attrition.
 *
 * Primary pipeline attribution order (mutually exclusive per symbol):
 * 1. no stock data (missing quote, history < MIN_HISTORY_FOR_RELIABLE_ATR, empty candles)
 * 2. no intraday / eligibility (EntryManagerService.evaluateEligibility: volume, avgVolume, volumeRatio, vwap)
 * 3. no finalDir / null score after conflict
 * 4. conflict (finalCls === 'NEUTRAL_CONFLICT')
 * 5. VPA live gate (when enabled)
 * 6. regime (unreliable Nifty feed, or counter-trend SHORT in BULL / LONG in BEAR)
 * 7. Friday gate (weekend gap risk policy)
 * 8. extension gate (anti blow-off day return / ATR multiples)
 * 9. ignore (finalCls === 'IGNORE' && SAVE_IGNORE_SIGNALS !== 'true')
 * 10. else saved / passed
 */

export interface OvernightScanMetrics {
  universeSize: number;
  processed: number;
  saved: number;
  passed?: number;
  droppedNoStockData: number;
  droppedNoIntraday: number;
  droppedEligibility: number;
  droppedRegime: number;
  droppedFridayGate: number;
  droppedExtension: number;
  droppedConflict: number;
  droppedIgnore: number;
  droppedVpaGate: number;
  errors: number;
}

export function createEmptyOvernightScanMetrics(universeSize: number = 0): OvernightScanMetrics {
  return {
    universeSize,
    processed: 0,
    saved: 0,
    passed: 0,
    droppedNoStockData: 0,
    droppedNoIntraday: 0,
    droppedEligibility: 0,
    droppedRegime: 0,
    droppedFridayGate: 0,
    droppedExtension: 0,
    droppedConflict: 0,
    droppedIgnore: 0,
    droppedVpaGate: 0,
    errors: 0,
  };
}

export function finalizeOvernightScanMetrics(metrics: OvernightScanMetrics, savedCount: number): OvernightScanMetrics {
  metrics.saved = savedCount;
  metrics.passed = savedCount;
  return metrics;
}

export function formatOvernightScanMetricsSummary(
  dateStr: string,
  timeStr: string,
  m: OvernightScanMetrics
): string {
  return (
    `[OvernightScan] date=${dateStr} time=${timeStr} universe=${m.universeSize} processed=${m.processed} saved=${m.saved} ` +
    `eligibility=${m.droppedEligibility} regime=${m.droppedRegime} friday=${m.droppedFridayGate} extension=${m.droppedExtension} ` +
    `conflict=${m.droppedConflict} noIntraday=${m.droppedNoIntraday} ignore=${m.droppedIgnore} errors=${m.errors}`
  );
}
