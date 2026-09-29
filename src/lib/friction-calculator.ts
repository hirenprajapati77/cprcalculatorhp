/**
 * Pure, deterministic trading friction and statutory charge calculators.
 *
 * Provides side-specific statutory levies, exchange transaction charges,
 * brokerage, and GST calculations across defined instrument tiers.
 *
 * GUARANTEES:
 * - Pure functions with zero side-effects and zero database/network I/O.
 * - Calling default tiers returns EXACT numeric identity with baseline hard-coded constants.
 */

import {
  FRICTION_MODELS,
  type IndexBtstFrictionTier,
  type StockBtstFrictionTier,
  type IntradayFrictionTier,
  type OptionPremiumFrictionTier,
} from '@/config/friction-constants';

export interface FrictionBreakdown {
  grossPnl: number;
  turnover: number;
  brokerage: number;
  stt: number;
  exchangeCharges: number;
  stampDuty: number;
  sebiCharges: number;
  gst: number;
  dpCharges: number;
  totalFriction: number;
  netPnl: number;
  effectiveBps: number;
  tierId: string;
  tierName: string;
}

export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

/**
 * Calculates friction for Index BTST (NIFTY/BANKNIFTY/SENSEX futures proxy).
 * Default tier is `EXCHANGE_TURNOVER_ONLY` (legacy 0.00002 / 0.2 bps).
 */
export function calculateIndexBtstFriction(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  tierId: IndexBtstFrictionTier = FRICTION_MODELS.INDEX_BTST.DEFAULT_TIER,
  direction: 'LONG' | 'SHORT' = 'LONG'
): FrictionBreakdown {
  const tier = FRICTION_MODELS.INDEX_BTST.TIERS[tierId] ?? FRICTION_MODELS.INDEX_BTST.TIERS.EXCHANGE_TURNOVER_ONLY;
  const buyTurnover = (direction === 'LONG' ? entryPrice : exitPrice) * quantity;
  const sellTurnover = (direction === 'LONG' ? exitPrice : entryPrice) * quantity;
  const turnover = buyTurnover + sellTurnover;
  const grossPnl = direction === 'LONG'
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;

  if (tier.mode === 'TURNOVER_FLAT') {
    const totalFriction = turnover * tier.turnoverRate;
    const netPnl = grossPnl - totalFriction;
    return {
      grossPnl,
      turnover,
      brokerage: 0,
      stt: 0,
      exchangeCharges: totalFriction,
      stampDuty: 0,
      sebiCharges: 0,
      gst: 0,
      dpCharges: 0,
      totalFriction,
      netPnl,
      effectiveBps: turnover > 0 ? round2((totalFriction / turnover) * 10000) : 0,
      tierId: tier.id,
      tierName: tier.name,
    };
  }

  // ITEMIZED_FUTURES tier
  const stt = sellTurnover * tier.sttSellRate;
  const stampDuty = buyTurnover * tier.stampDutyBuyRate;
  const exchangeCharges = turnover * tier.exchangeRatePerLeg;
  const sebiCharges = turnover * tier.sebiRate;
  const brokerage = tier.brokeragePerOrder * 2; // entry + exit
  const gst = (brokerage + exchangeCharges + sebiCharges) * tier.gstRate;
  const totalFriction = stt + stampDuty + exchangeCharges + sebiCharges + brokerage + gst;
  const netPnl = grossPnl - totalFriction;

  return {
    grossPnl: round2(grossPnl),
    turnover: round2(turnover),
    brokerage: round2(brokerage),
    stt: round2(stt),
    exchangeCharges: round2(exchangeCharges),
    stampDuty: round2(stampDuty),
    sebiCharges: round2(sebiCharges),
    gst: round2(gst),
    dpCharges: 0,
    totalFriction: round2(totalFriction),
    netPnl: round2(netPnl),
    effectiveBps: turnover > 0 ? round2((totalFriction / turnover) * 10000) : 0,
    tierId: tier.id,
    tierName: tier.name,
  };
}

/**
 * Calculates friction for Stock BTST.
 * Default tier is `FUTURES_PROXY` (existing 0.00030 / 3.0 bps).
 */
export function calculateStockBtstFriction(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  tierId: StockBtstFrictionTier = FRICTION_MODELS.STOCK_BTST.DEFAULT_TIER,
  direction: 'LONG' | 'SHORT' = 'LONG'
): FrictionBreakdown {
  const tier = FRICTION_MODELS.STOCK_BTST.TIERS[tierId] ?? FRICTION_MODELS.STOCK_BTST.TIERS.FUTURES_PROXY;
  const buyTurnover = (direction === 'LONG' ? entryPrice : exitPrice) * quantity;
  const sellTurnover = (direction === 'LONG' ? exitPrice : entryPrice) * quantity;
  const turnover = buyTurnover + sellTurnover;
  const grossPnl = direction === 'LONG'
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;

  if (tier.mode === 'TURNOVER_FLAT') {
    const totalFriction = turnover * tier.turnoverRate;
    const netPnl = grossPnl - totalFriction;
    return {
      grossPnl,
      turnover,
      brokerage: 0,
      stt: 0,
      exchangeCharges: totalFriction,
      stampDuty: 0,
      sebiCharges: 0,
      gst: 0,
      dpCharges: 0,
      totalFriction,
      netPnl,
      effectiveBps: turnover > 0 ? round2((totalFriction / turnover) * 10000) : 0,
      tierId: tier.id,
      tierName: tier.name,
    };
  }

  // ITEMIZED_CASH_DELIVERY tier
  const stt = (buyTurnover * tier.sttBuyRate) + (sellTurnover * tier.sttSellRate);
  const stampDuty = buyTurnover * tier.stampDutyBuyRate;
  const exchangeCharges = turnover * tier.exchangeRatePerLeg;
  const sebiCharges = turnover * tier.sebiRate;
  const brokerage = tier.brokeragePerOrder * 2;
  const dpCharges = tier.dpChargePerSell;
  const gst = (brokerage + exchangeCharges + sebiCharges) * tier.gstRate;
  const totalFriction = stt + stampDuty + exchangeCharges + sebiCharges + brokerage + dpCharges + gst;
  const netPnl = grossPnl - totalFriction;

  return {
    grossPnl: round2(grossPnl),
    turnover: round2(turnover),
    brokerage: round2(brokerage),
    stt: round2(stt),
    exchangeCharges: round2(exchangeCharges),
    stampDuty: round2(stampDuty),
    sebiCharges: round2(sebiCharges),
    gst: round2(gst),
    dpCharges: round2(dpCharges),
    totalFriction: round2(totalFriction),
    netPnl: round2(netPnl),
    effectiveBps: turnover > 0 ? round2((totalFriction / turnover) * 10000) : 0,
    tierId: tier.id,
    tierName: tier.name,
  };
}

/**
 * Calculates friction for general intraday/swing CPR backtest.
 * Default tier is `EQUITY_SWING` (existing 0.00030 / 3.0 bps).
 */
export function calculateIntradayFriction(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  tierId: IntradayFrictionTier = FRICTION_MODELS.INTRADAY.DEFAULT_TIER,
  direction: 'LONG' | 'SHORT' = 'LONG'
): FrictionBreakdown {
  const tier = FRICTION_MODELS.INTRADAY.TIERS[tierId] ?? FRICTION_MODELS.INTRADAY.TIERS.EQUITY_SWING;
  const turnover = (entryPrice + exitPrice) * quantity;
  const grossPnl = direction === 'LONG'
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;
  const totalFriction = turnover * tier.turnoverRate;
  const netPnl = grossPnl - totalFriction;

  return {
    grossPnl,
    turnover,
    brokerage: 0,
    stt: 0,
    exchangeCharges: totalFriction,
    stampDuty: 0,
    sebiCharges: 0,
    gst: 0,
    dpCharges: 0,
    totalFriction,
    netPnl,
    effectiveBps: turnover > 0 ? round2((totalFriction / turnover) * 10000) : 0,
    tierId: tier.id,
    tierName: tier.name,
  };
}

/**
 * Estimates statutory & broker charges for Trade Journal option positions.
 * Non-destructive: used for estimated net display without overwriting gross P&L.
 */
export function estimateOptionPremiumFriction(
  entryPremium: number,
  exitPremium: number,
  quantity = 1,
  tierId: OptionPremiumFrictionTier = FRICTION_MODELS.OPTION_PREMIUM.DEFAULT_TIER
): FrictionBreakdown {
  const tier = FRICTION_MODELS.OPTION_PREMIUM.TIERS[tierId] ?? FRICTION_MODELS.OPTION_PREMIUM.TIERS.RETAIL_STATUTORY;
  const buyTurnover = entryPremium * quantity;
  const sellTurnover = exitPremium * quantity;
  const turnover = buyTurnover + sellTurnover;
  const grossPnl = (exitPremium - entryPremium) * quantity;

  const stt = sellTurnover * tier.sttSellRate;
  const stampDuty = buyTurnover * tier.stampDutyBuyRate;
  const exchangeCharges = turnover * tier.exchangeRatePerLeg;
  const sebiCharges = turnover * tier.sebiRate;
  const brokerage = tier.brokeragePerOrder * 2;
  const gst = (brokerage + exchangeCharges + sebiCharges) * tier.gstRate;
  const totalFriction = stt + stampDuty + exchangeCharges + sebiCharges + brokerage + gst;
  const netPnl = grossPnl - totalFriction;

  return {
    grossPnl: round2(grossPnl),
    turnover: round2(turnover),
    brokerage: round2(brokerage),
    stt: round2(stt),
    exchangeCharges: round2(exchangeCharges),
    stampDuty: round2(stampDuty),
    sebiCharges: round2(sebiCharges),
    gst: round2(gst),
    dpCharges: 0,
    totalFriction: round2(totalFriction),
    netPnl: round2(netPnl),
    effectiveBps: turnover > 0 ? round2((totalFriction / turnover) * 10000) : 0,
    tierId: tier.id,
    tierName: tier.name,
  };
}
