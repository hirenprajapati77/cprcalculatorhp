import { MarketStockData } from '../market.service';
import { calculateATR } from '@/lib/atr';
import { safeRatio } from '@/lib/math';
import { NiftyHistoryService } from './nifty-history.service';

export const CORRELATION_WINDOW = 60;

export interface OvernightRiskMetrics {
  gapRisk: number;         // Average gap percentage (absolute value)
  atr: number;             // Average True Range (value)
  sectorRisk: number;      // Risk score/multiplier based on sector (0.5 to 2.0)
  indexCorrelationEstimate: number | null;
  volatility: number;      // Volatility (standard deviation of daily changes)
  shortSqueezeProb: number; // Probability of short squeeze (0 to 100)
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export class OvernightRiskService {
  /**
   * Calculates overnight risk metrics using daily historical data.
   */
  static async calculateOvernightRisk(stock: MarketStockData): Promise<OvernightRiskMetrics> {
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
    let indexCorrelationEstimate: number | null = null;
    if (len >= 2) {
      try {
        const startDate = new Date(history[0].date);
        const endDate = new Date(history[history.length - 1].date);
        const niftyHistory = await NiftyHistoryService.getNiftyHistory(startDate, endDate);

        const niftyMap = new Map<string, number>();
        for (const n of niftyHistory) {
          niftyMap.set(n.date, n.close);
        }

        const alignedStockCloses: number[] = [];
        const alignedNiftyCloses: number[] = [];
        for (const s of history) {
          if (niftyMap.has(s.date)) {
            alignedStockCloses.push(s.close);
            alignedNiftyCloses.push(niftyMap.get(s.date)!);
          }
        }

        const stockReturns: number[] = [];
        const niftyReturns: number[] = [];
        for (let i = 1; i < alignedStockCloses.length; i++) {
          const prevStock = alignedStockCloses[i - 1];
          const currStock = alignedStockCloses[i];
          const prevNifty = alignedNiftyCloses[i - 1];
          const currNifty = alignedNiftyCloses[i];

          stockReturns.push(safeRatio(currStock - prevStock, prevStock, 0) * 100);
          niftyReturns.push(safeRatio(currNifty - prevNifty, prevNifty, 0) * 100);
        }

        if (stockReturns.length >= CORRELATION_WINDOW) {
          const windowStockReturns = stockReturns.slice(-CORRELATION_WINDOW);
          const windowNiftyReturns = niftyReturns.slice(-CORRELATION_WINDOW);

          const meanStock = windowStockReturns.reduce((sum, v) => sum + v, 0) / CORRELATION_WINDOW;
          const meanNifty = windowNiftyReturns.reduce((sum, v) => sum + v, 0) / CORRELATION_WINDOW;

          let cov = 0;
          let varNifty = 0;
          for (let i = 0; i < CORRELATION_WINDOW; i++) {
            const diffStock = windowStockReturns[i] - meanStock;
            const diffNifty = windowNiftyReturns[i] - meanNifty;
            cov += diffStock * diffNifty;
            varNifty += diffNifty * diffNifty;
          }

          if (varNifty > 0) {
            indexCorrelationEstimate = parseFloat((cov / varNifty).toFixed(4));
          }
        }
      } catch (err) {
        console.warn(`[OvernightRiskService] Failed to calculate index correlation for ${stock.symbol}:`, err);
      }
    }

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
    let shortSqueezeProb = 10;
    if (len >= 3) {
      const recentReturn = safeRatio(stock.close - history[len - 3].close, history[len - 3].close, 0) * 100;
      if (recentReturn > 0) {
        shortSqueezeProb = Math.min(100, Math.floor((recentReturn * 2) + (volatility * 5) + 10));
      }
    }

    // Determine aggregate Risk Level
    // Combined metric based on gapRisk, volatility, sectorRisk, and squeeze risk
    // indexCorrelationEstimate scoring is deferred (Phase 2B optional)
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
