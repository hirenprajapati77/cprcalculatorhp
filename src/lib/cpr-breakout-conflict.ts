/**
 * Cross-engine conflict detection between Intraday CPR Scanner and Overnight BTST/STBT.
 *
 * Symmetrical & Strict Protection:
 * - Rejects BTST (LONG) if Intraday Scanner has confirmed an active 'BREAKDOWN'.
 * - Rejects STBT (SHORT) if Intraday Scanner has confirmed an active 'BREAKOUT'.
 *
 * Prevents taking overnight trades that fight against confirmed same-day CPR boundary violations.
 */

export interface BtstConflictCheckResult {
  conflicted: boolean;
  reason?: string;
  detail?: string;
}

export function evaluateBtstScannerConflict(
  btstDirection: 'LONG' | 'SHORT',
  scannerSignals?: string[] | null
): BtstConflictCheckResult {
  if (!scannerSignals || scannerSignals.length === 0) {
    return { conflicted: false };
  }

  const isBreakdown = scannerSignals.includes('BREAKDOWN');
  const isBreakout = scannerSignals.includes('BREAKOUT');

  // 1. BTST LONG is conflicted if scanner has confirmed a BREAKDOWN
  if (btstDirection === 'LONG' && isBreakdown) {
    return {
      conflicted: true,
      reason: 'SCANNER_BREAKDOWN_CONFLICT',
      detail: 'Suppressed: intraday scanner confirmed BREAKDOWN below CPR',
    };
  }

  // 2. STBT SHORT is conflicted if scanner has confirmed a BREAKOUT
  if (btstDirection === 'SHORT' && isBreakout) {
    return {
      conflicted: true,
      reason: 'SCANNER_BREAKOUT_CONFLICT',
      detail: 'Suppressed: intraday scanner confirmed BREAKOUT above CPR',
    };
  }

  return { conflicted: false };
}
