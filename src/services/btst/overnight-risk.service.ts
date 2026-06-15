import { MarketStockData } from '../market.service';

export interface OvernightRiskMetrics {
  gapRisk: number;         // Average gap percentage (absolute value)
  atr: number;             // Average True Range (value)
  sectorRisk: number;      // Risk score/multiplier based on sector (0.5 to 2.0)
  indexCorrelation: number;// Beta proxy (0.5 to 1.5)
  volatility: number;      // Volatility (standard deviation of daily changes)
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export class OvernightRiskService {
  /**
   * Calculates overnight risk metrics using daily historical data.
   */
  static calculateOvernightRisk(stock: MarketStockData): OvernightRiskMetrics {
    const history = stock.history || [];
    const len = history.length;

    // 1. ATR Calculation (default to 2% of close if history is insufficient)
    let atr = stock.close * 0.02;
    if (len >= 2) {
      let trueRangeSum = 0;
      for (let i = 1; i < len; i++) {
        const high = history[i].high;
        const low = history[i].low;
        const prevClose = history[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trueRangeSum += tr;
      }
      atr = trueRangeSum / (len - 1);
    }

    // 2. Gap Risk (Average gap % between Open and previous Close)
    let gapRisk = 0.5; // default 0.5%
    if (len >= 2) {
      let gapSum = 0;
      for (let i = 1; i < len; i++) {
        const prevClose = history[i - 1].close;
        const open = history[i].open;
        gapSum += Math.abs((open - prevClose) / prevClose) * 100;
      }
      gapRisk = gapSum / (len - 1);
    }

    // 3. Sector Risk Factor (deterministic based on sector name)
    const sector = stock.sector.toLowerCase();
    let sectorRisk = 1.0;
    if (sector.includes('it') || sector.includes('technology') || sector.includes('energy') || sector.includes('metal')) {
      sectorRisk = 1.3; // High risk
    } else if (sector.includes('finance') || sector.includes('bank')) {
      sectorRisk = 1.2;
    } else if (sector.includes('pharma') || sector.includes('healthcare') || sector.includes('fmcg') || sector.includes('consumer')) {
      sectorRisk = 0.8; // Defensive / Low risk
    }

    // 4. Index Correlation (Beta proxy)
    // Deterministic simulation based on symbol name/sector if real calculation is missing
    let indexCorrelation = 1.0;
    const charSum = stock.symbol.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    indexCorrelation = 0.7 + ((charSum % 10) / 10) * 0.8; // 0.7 to 1.5

    // 5. Volatility (Standard deviation of daily return percentage changes)
    let volatility = 1.5; // default 1.5%
    if (len >= 2) {
      const returns: number[] = [];
      for (let i = 1; i < len; i++) {
        const prevClose = history[i - 1].close;
        const close = history[i].close;
        returns.push(((close - prevClose) / prevClose) * 100);
      }
      const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
      const variance = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length;
      volatility = Math.sqrt(variance);
    }

    // Determine aggregate Risk Level
    // Combined metric based on gapRisk, volatility, and sectorRisk
    const riskFactor = (gapRisk * 0.4) + (volatility * 0.4) + (sectorRisk * 0.2);
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    if (riskFactor < 1.0) {
      riskLevel = 'LOW';
    } else if (riskFactor > 2.0) {
      riskLevel = 'HIGH';
    }

    return {
      gapRisk,
      atr,
      sectorRisk,
      indexCorrelation,
      volatility,
      riskLevel
    };
  }
}
