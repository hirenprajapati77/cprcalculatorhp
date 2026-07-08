import { MarketRegime } from './regime.service';
import { EventCalendarService } from './event.service';

export interface SignalQualityMetrics {
  historyQuality: number;
  liquidityQuality: number;
  eventRisk: number;
  regimeFit: number;
  conflictConfidence: number;
  qualityModelVersion: number;
  qualityBucket: 'TRADEABLE' | 'WATCHLIST' | 'LOW_QUALITY';
}

export class SignalQualityService {
  private static readonly QUALITY_MODEL_VERSION = 1;

  /**
   * Evaluates the quality of an overnight signal and categorizes it into a tradability bucket.
   */
  static async evaluateSignal(
    stock: MarketStockData,
    direction: 'LONG' | 'SHORT',
    longScore: number,
    shortScore: number,
    regime: MarketRegime,
    historyLength: number,
    signalDate: string
  ): Promise<SignalQualityMetrics> {
    // 1. History Quality (0-100)
    // 15 candles = 0, 200 candles = 100
    let historyQuality = 0;
    if (historyLength >= 15) {
      historyQuality = Math.min(100, Math.round(((historyLength - 15) / 185) * 100));
    }

    // 2. Liquidity Quality (0-100)
    // Based on avgVolume and Turnover (avgVolume * ltp)
    const avgVolume = stock.avgVolume || 0;
    const ltp = stock.ltp || stock.close || 0;
    const turnover = avgVolume * ltp;

    let liquidityQuality = 0;
    if (avgVolume >= 500000 && turnover >= 150000000) {
      liquidityQuality = 100; // Tier 1
    } else if (avgVolume >= 250000 && turnover >= 50000000) {
      liquidityQuality = 70; // Tier 2
    } else if (avgVolume >= 100000) {
      liquidityQuality = 40; // Tier 3
    } else {
      liquidityQuality = 0; // Illiquid
    }

    // 3. Conflict Confidence
    const conflictConfidence = Math.abs(longScore - shortScore);

    // 4. Regime Fit (0-100)
    let regimeFit = 50; // Neutral default
    if (direction === 'LONG' && regime.trend === 'BULL') regimeFit = 100;
    if (direction === 'SHORT' && regime.trend === 'BEAR') regimeFit = 100;
    if (direction === 'LONG' && regime.trend === 'BEAR') regimeFit = 0;
    if (direction === 'SHORT' && regime.trend === 'BULL') regimeFit = 0;

    // 5. Event Risk
    const stockEvent = await EventCalendarService.getEventRisk(stock.symbol, signalDate);
    const macroEvent = await EventCalendarService.getMacroEventRisk(signalDate);
    
    const maxSeverityEvent = stockEvent.severity >= macroEvent.severity ? stockEvent : macroEvent;
    const eventRisk = maxSeverityEvent.severity;

    // 6. Quality Bucket Classification
    let qualityBucket: 'TRADEABLE' | 'WATCHLIST' | 'LOW_QUALITY' = 'TRADEABLE';

    if (
      historyQuality < 20 ||
      liquidityQuality < 50 ||
      eventRisk >= 80 ||
      conflictConfidence < 15 // Stricter than the absolute 10-point cutoff
    ) {
      qualityBucket = 'LOW_QUALITY';
    } else if (regimeFit < 50 || liquidityQuality < 80 || maxSeverityEvent.confidence === 'UNKNOWN') {
      // Misaligned regime, slightly weak liquidity, or unknown event risk drops it to Watchlist
      qualityBucket = 'WATCHLIST';
    }

    return {
      historyQuality,
      liquidityQuality,
      eventRisk,
      regimeFit,
      conflictConfidence,
      qualityModelVersion: this.QUALITY_MODEL_VERSION,
      qualityBucket,
    };
  }
}
