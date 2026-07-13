import { MarketStockData } from '../market.service';
import { calculateATR } from '@/lib/atr';
import { safeRatio } from '@/lib/math';

export interface OvernightRiskMetrics {
  gapRisk: number;         // Average gap percentage (absolute value)
  atr: number;             // Average True Range (value)
  sectorRisk: number;      // Risk score/multiplier based on sector (0.5 to 2.0)
  // TODO: Real index correlation requires rolling covariance of stock daily returns vs NIFTY.
  // NIFTY history is not yet fetched — this field is a placeholder and must NOT be shown to users.
  indexCorrelationEstimate: number | null;
  volatility: number;      // Volatility (standard deviation of daily changes)
  shortSqueezeProb: number; // Probability of short squeeze (0 to 100)
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
    const atr = calculateATR(history, stock.close);

    // 2. Gap Risk (Average gap % between Open and previous Close)
    let gapRisk = 0.5; // default 0.5%
    if (len >= 2) {
      let gapSum = 0;
      for (let i = 1; i < len; i++) {
        const prevClose = history[i - 1].close;
        const open = history[i].open;
        gapSum += Math.abs(safeRatio(open - prevClose, prevClose, 0)) * 100;
      }
      gapRisk = safeRatio(gapSum, len - 1, 0.5);
    }

    // 3. Sector Risk Factor (deterministic based on sector name)
    const sector = stock.sector.trim().toLowerCase();
    let sectorRisk = 1.0;
    // Exact-match whitelist (not substring .includes()) — a naive substring check on 'it'
    // previously matched "Capital Goods" (cap-IT-al) and would also match "Utilities" if that
    // sector is ever added, silently mis-tagging them as high-risk IT/Energy/Metal names.
    const HIGH_RISK_SECTORS = new Set(['it', 'technology', 'energy', 'metals', 'metal']);
    const RATE_SENSITIVE_SECTORS = new Set(['financial services', 'finance', 'banking', 'bank']);
    const DEFENSIVE_SECTORS = new Set(['healthcare', 'pharma', 'pharmaceuticals', 'fmcg', 'consumer goods', 'consumer']);

    if (HIGH_RISK_SECTORS.has(sector)) {
      sectorRisk = 1.3; // High risk
    } else if (RATE_SENSITIVE_SECTORS.has(sector)) {
      sectorRisk = 1.2;
    } else if (DEFENSIVE_SECTORS.has(sector)) {
      sectorRisk = 0.8; // Defensive / Low risk
    }

    // 4. Index Correlation (Beta proxy)
    // TODO: Replace with real rolling covariance vs NIFTY when NIFTY history is available.
    // Previously this hashed the symbol string (charCode sum) which is NOT a real correlation.
    // Set to null until real data is wired in — do NOT display this field to users.
    const indexCorrelationEstimate: number | null = null;

    // 5. Volatility (Standard deviation of daily return percentage changes)
    let volatility = 1.5; // default 1.5%
    if (len >= 2) {
      const returns: number[] = [];
      for (let i = 1; i < len; i++) {
        const prevClose = history[i - 1].close;
        const close = history[i].close;
        returns.push(safeRatio(close - prevClose, prevClose, 0) * 100);
      }
      const mean = safeRatio(returns.reduce((sum, val) => sum + val, 0), returns.length, 0);
      const variance = safeRatio(returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0), returns.length, 0);
      volatility = Math.sqrt(variance);
    }

    // 6. Short Squeeze Probability
    // Proxy: High volatility + strong recent upward momentum increases squeeze probability
    let shortSqueezeProb = 10;
    if (len >= 3) {
      const recentReturn = safeRatio(stock.close - history[len - 3].close, history[len - 3].close, 0) * 100;
      if (recentReturn > 0) {
        shortSqueezeProb = Math.min(100, Math.floor((recentReturn * 2) + (volatility * 5) + 10));
      }
    }

    // Determine aggregate Risk Level
    // Combined metric based on gapRisk, volatility, sectorRisk, and squeeze risk
    const riskFactor = (gapRisk * 0.4) + (volatility * 0.4) + (sectorRisk * 0.2) + (shortSqueezeProb * 0.01);
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    if (riskFactor < 1.0) {
      riskLevel = 'LOW';
    } else if (riskFactor > 2.5) {
      riskLevel = 'HIGH';
    }

    return {
      gapRisk,
      atr,
      sectorRisk,
      indexCorrelationEstimate,
      volatility,
      shortSqueezeProb,
      riskLevel
    };
  }
}

