import { prisma } from '@/lib/db';

export interface GroupedStat {
  groupValue: string;
  count: number;
  winRate: number;
  avgPnlPct: number;
}

export class JournalReportService {
  /**
   * General purpose aggregator for any string field on TradeJournal
   */
  private static async aggregateByField(field: string): Promise<GroupedStat[]> {
    const closedTrades = await prisma.tradeJournal.findMany({
      where: {
        pnl: { not: null },
      },
      select: {
        [field]: true,
        pnl: true,
        pnlPct: true,
      },
    });

    const groups: Record<string, { count: number; wins: number; losses: number; totalPnlPct: number }> = {};

    for (const trade of closedTrades) {
      const val = (trade as Record<string, unknown>)[field];
      const key = typeof val === 'string' && val.trim() !== '' ? val : 'UNKNOWN';

      if (!groups[key]) {
        groups[key] = { count: 0, wins: 0, losses: 0, totalPnlPct: 0 };
      }
      
      const pnl = trade.pnl ?? 0;
      const pnlPct = trade.pnlPct ?? 0;

      groups[key].count += 1;
      groups[key].totalPnlPct += pnlPct;
      if (pnl > 0) {
        groups[key].wins += 1;
      } else if (pnl < 0) {
        groups[key].losses += 1;
      }
    }

    return Object.entries(groups).map(([groupValue, stats]) => {
      const decisive = stats.wins + stats.losses;
      return {
        groupValue,
        count: stats.count,
        winRate: decisive > 0 ? (stats.wins / decisive) * 100 : 0,
        avgPnlPct: stats.count > 0 ? (stats.totalPnlPct / stats.count) : 0,
      };
    }).sort((a, b) => b.count - a.count);
  }

  static async getQualityBucketStats(): Promise<GroupedStat[]> {
    return this.aggregateByField('qualityBucketAtSignal');
  }

  static async getRegimeStats(): Promise<GroupedStat[]> {
    return this.aggregateByField('regimeSnapshotAtSignal');
  }

  static async getExecutionOutcomeStats(): Promise<GroupedStat[]> {
    return this.aggregateByField('executionOutcome');
  }

  static async getEventRiskStats(): Promise<GroupedStat[]> {
    return this.aggregateByField('eventRiskReasonAtSignal');
  }

  /**
   * Calculates overall execution variance (model vs actual)
   */
  static async getExecutionVarianceReport() {
    const trades = await prisma.tradeJournal.findMany({
      where: {
        pnlPct: { not: null },
      },
      select: {
        pnlPct: true,
        modelEntryPrice: true,
        modelExitPrice: true,
        signalType: true,
      }
    });

    let totalVariance = 0;
    let count = 0;

    for (const t of trades) {
      if (t.modelEntryPrice && t.modelExitPrice && t.pnlPct !== null) {
        // STBT/SHORT model P&L is inverted vs long stock/CE trades
        const isShort = t.signalType === 'STBT';
        const modelPnlPct = isShort
          ? ((t.modelEntryPrice - t.modelExitPrice) / t.modelEntryPrice) * 100
          : ((t.modelExitPrice - t.modelEntryPrice) / t.modelEntryPrice) * 100;
        // In options, variance is not 1:1, but this gives a directional heuristic
        const variance = t.pnlPct - modelPnlPct;
        totalVariance += variance;
        count++;
      }
    }

    return {
      averageVariancePct: count > 0 ? totalVariance / count : 0,
      sampleSize: count
    };
  }
}
