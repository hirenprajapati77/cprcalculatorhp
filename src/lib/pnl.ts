import { safeRatio } from './math';
import {
  estimateOptionPremiumFriction,
  calculateStockBtstFriction,
  type FrictionBreakdown,
} from './friction-calculator';
import { FALLBACK_LOT_SIZES } from '@/services/option-suggestion.service';

export interface OptionPnl {
  pnl: number;
  pnlPct: number;
}

export interface JournalEstimatedFrictionResult {
  grossPnl: number;
  grossPnlPct: number;
  estimatedChargesPerUnit: number;
  estimatedChargesTotal: number;
  estimatedNetPnl: number;
  estimatedNetPnlPct: number;
  effectiveBps: number;
  tierId: string;
  tierName: string;
  lotSize: number;
  isModelEstimate: true;
  breakdown: {
    brokerage: number;
    stt: number;
    exchangeCharges: number;
    stampDuty: number;
    sebiCharges: number;
    gst: number;
    dpCharges: number;
    totalFriction: number;
  };
}

export interface JournalEstimatedFrictionOptions {
  entryCmp: number;
  exitCmp: number;
  symbol?: string;
  signalType?: string;
  optionContract?: string;
  isShortUnderlying?: boolean;
  lotSize?: number;
}

/**
 * Computes direction-aware P&L for journal entries.
 * - Standard option positions (CE and PE premium buys) and Long underlying cash legs: exit - entry
 * - Short underlying cash positions (STBT fallback legs): entry - exit
 */
export function computeJournalPnl(
  entryCmp: number,
  exitCmp: number,
  opts?: { isShortUnderlying?: boolean | undefined }
): OptionPnl {
  const isShort = Boolean(opts?.isShortUnderlying);
  const pnl = isShort ? entryCmp - exitCmp : exitCmp - entryCmp;
  const pnlPct = safeRatio(pnl, entryCmp, 0) * 100;
  return {
    pnl: round2(pnl),
    pnlPct: round2(pnlPct),
  };
}

export function computeOptionPnl(entryCmp: number, exitCmp: number): OptionPnl {
  return computeJournalPnl(entryCmp, exitCmp, { isShortUnderlying: false });
}

/**
 * Computes non-destructive estimated trading friction and net P&L for Trade Journal entries.
 *
 * Guarantees:
 * 1. Gross P&L is 100% identical to stored journal P&L.
 * 2. Estimated charges are modeled separately using statutory Indian exchange & tax schedules.
 * 3. Clearly flagged as a simulated/modeled estimate (isModelEstimate: true).
 */
export function computeJournalEstimatedFriction(
  params: JournalEstimatedFrictionOptions
): JournalEstimatedFrictionResult {
  const {
    entryCmp,
    exitCmp,
    symbol,
    optionContract,
    isShortUnderlying,
  } = params;

  const gross = computeJournalPnl(
    entryCmp,
    exitCmp,
    isShortUnderlying !== undefined ? { isShortUnderlying } : undefined
  );
  const isUnderlying = Boolean(optionContract && optionContract.startsWith('UNDERLYING'));

  let breakdown: FrictionBreakdown;
  let lotSize = params.lotSize ?? 1;

  if (isUnderlying) {
    // Underlying cash / futures leg (1 share/unit basis unless specified)
    const direction = isShortUnderlying ? 'SHORT' : 'LONG';
    breakdown = calculateStockBtstFriction(entryCmp, exitCmp, lotSize, 'FUTURES_PROXY', direction);
  } else {
    // Option contract: determine lot size if available to model realistic round-trip contract friction
    if (!params.lotSize && symbol) {
      const cleanSym = symbol.replace(/^NSE:|^BSE:/, '').trim().toUpperCase();
      lotSize = FALLBACK_LOT_SIZES[cleanSym] ?? 1;
    }
    breakdown = estimateOptionPremiumFriction(entryCmp, exitCmp, lotSize);
  }

  const estimatedChargesTotal = breakdown.totalFriction;
  const estimatedChargesPerUnit = lotSize > 0 ? estimatedChargesTotal / lotSize : estimatedChargesTotal;
  const estimatedNetPnl = gross.pnl - estimatedChargesPerUnit;
  const estimatedNetPnlPct = safeRatio(estimatedNetPnl, entryCmp, 0) * 100;

  return {
    grossPnl: gross.pnl,
    grossPnlPct: gross.pnlPct,
    estimatedChargesPerUnit: round2(estimatedChargesPerUnit),
    estimatedChargesTotal: round2(estimatedChargesTotal),
    estimatedNetPnl: round2(estimatedNetPnl),
    estimatedNetPnlPct: round2(estimatedNetPnlPct),
    effectiveBps: breakdown.effectiveBps,
    tierId: breakdown.tierId,
    tierName: breakdown.tierName,
    lotSize,
    isModelEstimate: true,
    breakdown: {
      brokerage: breakdown.brokerage,
      stt: breakdown.stt,
      exchangeCharges: breakdown.exchangeCharges,
      stampDuty: breakdown.stampDuty,
      sebiCharges: breakdown.sebiCharges,
      gst: breakdown.gst,
      dpCharges: breakdown.dpCharges,
      totalFriction: breakdown.totalFriction,
    },
  };
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
