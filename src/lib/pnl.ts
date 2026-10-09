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

export const DEFAULT_OPTION_LOT_SIZE = 500;

export interface ResolveOptionLotSizeParams {
  symbol?: string | null | undefined;
  optionStrike?: number | null | undefined;
  optionContract?: string | null | undefined;
  explicitLotSize?: number | null | undefined;
}

/**
 * Resolves a realistic contract lot size for an option contract to prevent flat-brokerage distortion.
 *
 * Priority order:
 * 1. Explicit lotSize parameter (> 0) if provided by caller.
 * 2. Exact symbol lookup in FALLBACK_LOT_SIZES table.
 * 3. Heuristic estimate based on option strike:
 *    Under SEBI derivative guidelines, equity option contracts target ~₹5 Lakhs notional (500,000 / strike).
 * 4. Safe median option lot size proxy (500 shares) — NEVER 1 share for an exchange-traded option contract.
 */
export function resolveOptionLotSize(params: ResolveOptionLotSizeParams): number {
  if (params.explicitLotSize && params.explicitLotSize > 0) {
    return params.explicitLotSize;
  }

  if (params.symbol) {
    const cleanSym = params.symbol.replace(/^NSE:|^BSE:/, '').trim().toUpperCase();
    const mapped = FALLBACK_LOT_SIZES[cleanSym];
    if (mapped && mapped > 0) {
      return mapped;
    }
  }

  // Attempt strike extraction from explicit optionStrike or from optionContract name
  let strike = params.optionStrike;
  if ((!strike || strike <= 0) && params.optionContract) {
    const strikeMatch = params.optionContract.match(/(?:^|\s|[A-Za-z])(\d{2,6})\s*(?:CE|PE)\b/i);
    if (strikeMatch && strikeMatch[1]) {
      const parsed = parseInt(strikeMatch[1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        strike = parsed;
      }
    }
  }

  if (strike && strike > 0) {
    const approx = Math.round(500_000 / strike);
    return Math.max(25, approx);
  }

  return DEFAULT_OPTION_LOT_SIZE;
}

export interface JournalEstimatedFrictionOptions {
  entryCmp: number;
  exitCmp: number;
  symbol?: string;
  signalType?: string;
  optionContract?: string;
  optionStrike?: number;
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
    optionStrike,
    isShortUnderlying,
  } = params;

  const gross = computeJournalPnl(
    entryCmp,
    exitCmp,
    isShortUnderlying !== undefined ? { isShortUnderlying } : undefined
  );
  const isUnderlying = Boolean(optionContract && optionContract.startsWith('UNDERLYING'));

  let breakdown: FrictionBreakdown;
  let lotSize: number;

  if (isUnderlying) {
    // Underlying cash / futures leg (1 share/unit basis unless specified)
    lotSize = params.lotSize ?? 1;
    const direction = isShortUnderlying ? 'SHORT' : 'LONG';
    breakdown = calculateStockBtstFriction(entryCmp, exitCmp, lotSize, 'FUTURES_PROXY', direction);
  } else {
    // Option contract: determine lot size to model realistic round-trip contract friction
    lotSize = resolveOptionLotSize({
      symbol,
      optionStrike,
      optionContract,
      explicitLotSize: params.lotSize,
    });
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
