import { OHLC } from './historical.provider';

export interface BacktestTradeConfig {
  capital: number;
  riskModel: string; // "Fixed" | "Risk%" | "Capital%"
  riskValue: number;
  executionMode: string; // "conservative" | "optimistic"
  avgVolume: number;
  volatility: string; // "HIGH" | "LOW" | "NORMAL"
}

export class TradeEngineService {
  /**
   * Dynamically calculates slippage based on liquidity and regime volatility.
   */
  static calculateSlippage(avgVolume: number, volatility: string, isGapExit: boolean): number {
    // 1. Base Slippage from Liquidity Tiers
    let baseSlippage = 0.0015; // default 0.15% for low liquidity
    if (avgVolume >= 500000) {
      baseSlippage = 0.0005; // 0.05% for high liquidity
    } else if (avgVolume >= 250000) {
      baseSlippage = 0.0010; // 0.10% for medium liquidity
    }

    // 2. Volatility Multiplier
    let multiplier = 1.0;
    if (volatility === 'HIGH') multiplier = 1.5;
    else if (volatility === 'LOW') multiplier = 0.8;

    let finalSlippage = baseSlippage * multiplier;

    // 3. Gap-through-stop / Auction penalty
    if (isGapExit) {
      // Severe penalty for auction fill on gap-through-stop
      finalSlippage = finalSlippage * 3.0; 
      // Cap gap slippage at 1.0%
      finalSlippage = Math.min(finalSlippage, 0.01);
    }

    // Cap normal slippage at 0.5%
    return Math.min(finalSlippage, 0.005);
  }
  /**
   * Simulates a trade's execution through OHLC data until it hits SL or Target or the data ends.
   */
  static simulateTrade(
    type: 'LONG' | 'SHORT',
    entryPrice: number,
    sl: number,
    target: number,
    ohlcSeries: OHLC[],
    config: BacktestTradeConfig
  ) {
    let status = 'OPEN';
    let exitPrice: number | null = null;
    let exitDate: string | null = null;
    let exitReason: string | null = null;
    let pnl = 0;
    let rr = 0;
    
    // Calculate Position Size
    let positionSize = 1;
    let riskAmount = 0;
    const riskPerShare = Math.abs(entryPrice - sl);

    if (config.riskModel === 'Fixed') {
      riskAmount = config.riskValue;
      positionSize = riskAmount / riskPerShare;
    } else if (config.riskModel === 'Risk%') {
      riskAmount = config.capital * (config.riskValue / 100);
      positionSize = riskAmount / riskPerShare;
    } else if (config.riskModel === 'Capital%') {
      const capitalUsed = config.capital * (config.riskValue / 100);
      positionSize = capitalUsed / entryPrice;
      riskAmount = positionSize * riskPerShare;
    }

    // Guard 1: Cap notional exposure to 1× capital (max 100% leverage).
    // 2× still caused >700% drawdown; capping at 1× prevents equity going deeply negative.
    const MAX_NOTIONAL = config.capital * 1;
    const notional = positionSize * entryPrice;
    if (notional > MAX_NOTIONAL) {
      positionSize = MAX_NOTIONAL / entryPrice;
    }
    // Guard 2: Minimum 1 share; always use integer share count.
    positionSize = Math.max(1, Math.floor(positionSize));
    // Guard 3: Recalculate riskAmount after capping so P&L is consistent.
    riskAmount = positionSize * riskPerShare;

    let durationDays = 0;
    const journalEvents = [];

    journalEvents.push({
      event: 'ENTRY',
      timestamp: new Date(ohlcSeries[0]?.date || Date.now()),
      details: `Entered at ${entryPrice.toFixed(2)}, SL: ${sl.toFixed(2)}, Target: ${target.toFixed(2)}`
    });

    for (let i = 0; i < ohlcSeries.length; i++) {
      const candle = ohlcSeries[i];
      durationDays++;

      // CHECK 1: Gap at open (must check before high/low)
      if (type === 'LONG') {
        if (candle.open <= sl) {
          status = 'CLOSED_SL_GAP';
          const slip = this.calculateSlippage(config.avgVolume, config.volatility, true);
          exitPrice = candle.open * (1 - slip);
          exitDate = candle.date;
          exitReason = `Gap Down below Stop Loss (Gap Penalty: ${(slip * 100).toFixed(2)}%)`;
          journalEvents.push({
            event: 'SL_MOVE',
            timestamp: new Date(candle.date),
            details: `Stop loss executed due to gap at ${exitPrice.toFixed(2)}`
          });
          break;
        }
        if (candle.open >= target) {
          status = 'CLOSED_TARGET_GAP';
          const slip = this.calculateSlippage(config.avgVolume, config.volatility, true);
          exitPrice = candle.open * (1 - slip);
          exitDate = candle.date;
          exitReason = `Gap Up above Target (Gap Penalty: ${(slip * 100).toFixed(2)}%)`;
          journalEvents.push({
            event: 'TARGET',
            timestamp: new Date(candle.date),
            details: `Target reached due to gap at ${exitPrice.toFixed(2)}`
          });
          break;
        }
      } else { // SHORT
        if (candle.open >= sl) {
          status = 'CLOSED_SL_GAP';
          const slip = this.calculateSlippage(config.avgVolume, config.volatility, true);
          exitPrice = candle.open * (1 + slip);
          exitDate = candle.date;
          exitReason = `Gap Up above Stop Loss (Gap Penalty: ${(slip * 100).toFixed(2)}%)`;
          journalEvents.push({
            event: 'SL_MOVE',
            timestamp: new Date(candle.date),
            details: `Stop loss executed due to gap at ${exitPrice.toFixed(2)}`
          });
          break;
        }
        if (candle.open <= target) {
          status = 'CLOSED_TARGET_GAP';
          const slip = this.calculateSlippage(config.avgVolume, config.volatility, true);
          exitPrice = candle.open * (1 + slip);
          exitDate = candle.date;
          exitReason = `Gap Down below Target (Gap Penalty: ${(slip * 100).toFixed(2)}%)`;
          journalEvents.push({
            event: 'TARGET',
            timestamp: new Date(candle.date),
            details: `Target reached due to gap at ${exitPrice.toFixed(2)}`
          });
          break;
        }
      }

      const high = candle.high;
      const low = candle.low;

      let hitSl = false;
      let hitTarget = false;

      if (type === 'LONG') {
        if (low <= sl) hitSl = true;
        if (high >= target) hitTarget = true;
      } else {
        if (high >= sl) hitSl = true;
        if (low <= target) hitTarget = true;
      }

      if (hitSl && hitTarget) {
        if (config.executionMode === 'conservative') {
          // Assume SL hit first
          hitSl = true;
          hitTarget = false;
        } else {
          // Optimistic: Assume target hit first
          hitSl = false;
          hitTarget = true;
        }
      }

      if (hitSl) {
        status = 'CLOSED_SL';
        const slip = this.calculateSlippage(config.avgVolume, config.volatility, false);
        exitPrice = type === 'LONG' ? sl * (1 - slip) : sl * (1 + slip);
        exitDate = candle.date;
        exitReason = `Stop Loss Hit (Slippage: ${(slip * 100).toFixed(2)}%)`;
        
        journalEvents.push({
          event: 'SL_MOVE',
          timestamp: new Date(candle.date),
          details: `Stop loss executed at ${exitPrice.toFixed(2)}`
        });
        break;
      }

      if (hitTarget) {
        status = 'CLOSED_TARGET';
        const slip = this.calculateSlippage(config.avgVolume, config.volatility, false);
        exitPrice = type === 'LONG' ? target * (1 - slip) : target * (1 + slip);
        exitDate = candle.date;
        exitReason = `Target Hit (Slippage: ${(slip * 100).toFixed(2)}%)`;
        
        journalEvents.push({
          event: 'TARGET',
          timestamp: new Date(candle.date),
          details: `Target reached at ${exitPrice.toFixed(2)}`
        });
        break;
      }
    }

    if (status === 'OPEN') {
      status = 'CLOSED_TIME_EXIT';
      exitPrice = ohlcSeries[ohlcSeries.length - 1].close;
      exitDate = ohlcSeries[ohlcSeries.length - 1].date;
      exitReason = `Max holding period (${ohlcSeries.length} days) reached`;

      journalEvents.push({
        event: 'EXIT',
        timestamp: new Date(exitDate),
        details: `Closed at end of holding window (day ${ohlcSeries.length}) at ${exitPrice.toFixed(2)}`
      });
    }

    if (type === 'LONG' && exitPrice !== null) {
      pnl = (exitPrice - entryPrice) * positionSize;
      rr = (exitPrice - entryPrice) / (entryPrice - sl);
    } else if (type === 'SHORT' && exitPrice !== null) {
      pnl = (entryPrice - exitPrice) * positionSize;
      rr = (entryPrice - exitPrice) / (sl - entryPrice);
    }

    return {
      status,
      exitPrice,
      exitDate,
      exitReason,
      pnl,
      pnlPercent: pnl / config.capital * 100,
      positionSize,
      rr,
      durationDays,
      riskAmount,
      journalEvents
    };
  }
}
