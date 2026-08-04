import { MarketStockData } from '../market.service';
import { calculateATR } from '@/lib/atr';
import { safeRatio } from '@/lib/math';
import { NiftyHistoryService } from './nifty-history.service';
import { getISTDateString } from '@/lib/market-hours';
import { HistoricalProvider, OHLC } from '../backtest/historical.provider';

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
  private static stockHistoryCache = new Map<string, OHLC[]>();
  // Max entries to hold in the in-process history cache.
  // 182 FNO stocks × 120-day fetch would be unbounded — cap at 60 entries
  // (enough for one full overnight batch) and evict the oldest half when exceeded.
  private static readonly MAX_CACHE_ENTRIES = 60;

  private static parseUtcDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  private static async getExtendedStockHistory(
    symbol: string,
    startDate: Date,
    endDateExclusive: Date
  ): Promise<OHLC[]> {
    const cleanSymbol = symbol.split(':')[0].trim();
    const startStr = getISTDateString(startDate);
    const endStr = getISTDateString(endDateExclusive);
    const cacheKey = `${cleanSymbol}:${startStr}:${endStr}`;

    if (this.stockHistoryCache.has(cacheKey)) {
      return this.stockHistoryCache.get(cacheKey)!;
    }

    const history = await HistoricalProvider.getHistory(cleanSymbol, startDate, endDateExclusive);
    this.evictIfNeeded();
    this.stockHistoryCache.set(cacheKey, history);
    return history;
  }

  static clearCache(): void {
    this.stockHistoryCache.clear();
  }

  /** Evict the oldest half of entries when cache exceeds MAX_CACHE_ENTRIES. */
  private static evictIfNeeded(): void {
    if (this.stockHistoryCache.size < this.MAX_CACHE_ENTRIES) return;
    const evictCount = Math.floor(this.MAX_CACHE_ENTRIES / 2);
    const keys = this.stockHistoryCache.keys();
    for (let i = 0; i < evictCount; i++) {
      const key = keys.next().value;
      if (key !== undefined) this.stockHistoryCache.delete(key);
    }
  }

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
        let stockHistoryForCorrelation = history;
        if (len < CORRELATION_WINDOW + 1 && len >= 20) {
          // MarketService currently returns a ~22-session slice. Pull a longer independent
          // window only for correlation math so 60-return beta becomes reachable.
          const latestSessionDate = OvernightRiskService.parseUtcDate(history[history.length - 1].date);
          const startDate = new Date(Date.UTC(
            latestSessionDate.getUTCFullYear(),
            latestSessionDate.getUTCMonth(),
            latestSessionDate.getUTCDate() - 120
          ));
          const endDateExclusive = new Date(Date.UTC(
            latestSessionDate.getUTCFullYear(),
            latestSessionDate.getUTCMonth(),
            latestSessionDate.getUTCDate() + 1
          ));
          stockHistoryForCorrelation = await OvernightRiskService.getExtendedStockHistory(
            stock.symbol,
            startDate,
            endDateExclusive
          );
        }

        const corrStartDate = OvernightRiskService.parseUtcDate(stockHistoryForCorrelation[0].date);
        const corrLatestDate = OvernightRiskService.parseUtcDate(
          stockHistoryForCorrelation[stockHistoryForCorrelation.length - 1].date
        );
        const corrEndDateExclusive = new Date(Date.UTC(
          corrLatestDate.getUTCFullYear(),
          corrLatestDate.getUTCMonth(),
          corrLatestDate.getUTCDate() + 1
        ));
        const niftyHistory = await NiftyHistoryService.getNiftyHistory(corrStartDate, corrEndDateExclusive);

        const niftyMap = new Map<string, number>();
        for (const n of niftyHistory) {
          niftyMap.set(n.date, n.close);
        }

        const alignedStockCloses: number[] = [];
        const alignedNiftyCloses: number[] = [];
        for (const s of stockHistoryForCorrelation) {
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

          // Skip invalid bases — safeRatio(..., 0) would insert fake 0% returns and poison beta.
          if (prevStock <= 0 || prevNifty <= 0) continue;

          stockReturns.push(safeRatio(currStock - prevStock, prevStock, 0) * 100);
          niftyReturns.push(safeRatio(currNifty - prevNifty, prevNifty, 0) * 100);
        }

        if (stockReturns.length >= CORRELATION_WINDOW) {
          const windowStockReturns = stockReturns.slice(-CORRELATION_WINDOW);
          const windowNiftyReturns = niftyReturns.slice(-CORRELATION_WINDOW);

          const meanStock = safeRatio(
            windowStockReturns.reduce((sum, v) => sum + v, 0),
            CORRELATION_WINDOW,
            0
          );
          const meanNifty = safeRatio(
            windowNiftyReturns.reduce((sum, v) => sum + v, 0),
            CORRELATION_WINDOW,
            0
          );

          let cov = 0;
          let varNifty = 0;
          for (let i = 0; i < CORRELATION_WINDOW; i++) {
            const diffStock = windowStockReturns[i] - meanStock;
            const diffNifty = windowNiftyReturns[i] - meanNifty;
            cov += diffStock * diffNifty;
            varNifty += diffNifty * diffNifty;
          }

          if (varNifty > 0) {
            indexCorrelationEstimate = parseFloat(safeRatio(cov, varNifty, 0).toFixed(4));
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
    // Combined metric based on gapRisk, volatility, sectorRisk, shortSqueezeProb, and indexCorrelationEstimate (Phase 2B).
    //
    // Weight and Direction Justification:
    // - Direction: indexCorrelationEstimate (Beta vs NIFTY) measures systematic market sensitivity.
    //   - Beta > 1.0 (High Beta): Amplifies broad-market overnight gaps/shocks, increasing holding risk.
    //   - Beta < 1.0 (Low Beta): Less sensitive to macro market moves, reducing systematic gap risk.
    //   - Beta = 1.0 (Market Neutral) / null (Insufficient data <60d): Represents baseline market risk (0.0 delta).
    // - Weight (0.20): A +1.0 shift in beta (e.g. Beta 2.0 vs 1.0) adds +0.20 to riskFactor. This provides meaningful
    //   sensitivity to market correlation without overwhelming idiosyncratic gapRisk (weight 0.4) or volatility (weight 0.4).
    // - Threshold Neutrality: By centering beta at 1.0 baseline (delta = beta - 1.0), missing/null or 1.0-beta inputs contribute
    //   0.0 extra risk delta. This mathematically preserves the original threshold boundaries (<1.0 LOW, >2.5 HIGH) and
    //   ensures backwards compatibility with pre-Phase-2B risk scores.
    const beta = indexCorrelationEstimate ?? 1.0;
    const correlationRisk = (beta - 1.0) * 0.2;
    const riskFactor = (gapRisk * 0.4) + (volatility * 0.4) + (sectorRisk * 0.2) + (shortSqueezeProb * 0.01) + correlationRisk;
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
