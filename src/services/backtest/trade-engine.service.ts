import { OHLC } from './historical.provider';

export interface BacktestTradeConfig {
  capital: number;
  riskModel: string; // "Fixed" | "Risk%" | "Capital%"
  riskValue: number;
  executionMode: string; // "conservative" | "optimistic"
}

export class TradeEngineService {
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
        exitPrice = sl;
        exitDate = candle.date;
        exitReason = 'Stop Loss Hit';
        
        journalEvents.push({
          event: 'SL_MOVE',
          timestamp: new Date(candle.date),
          details: `Stop loss executed at ${sl.toFixed(2)}`
        });
        break;
      }

      if (hitTarget) {
        status = 'CLOSED_TARGET';
        exitPrice = target;
        exitDate = candle.date;
        exitReason = 'Target Hit';
        
        journalEvents.push({
          event: 'TARGET',
          timestamp: new Date(candle.date),
          details: `Target reached at ${target.toFixed(2)}`
        });
        break;
      }
    }

    if (status === 'OPEN') {
      status = 'CLOSED_EOD';
      exitPrice = ohlcSeries[ohlcSeries.length - 1].close;
      exitDate = ohlcSeries[ohlcSeries.length - 1].date;
      exitReason = 'End of Backtest Period';
      
      journalEvents.push({
        event: 'EXIT',
        timestamp: new Date(exitDate),
        details: `Closed at EOD at ${exitPrice.toFixed(2)}`
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
