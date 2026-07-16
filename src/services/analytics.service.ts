import { prisma } from '@/lib/db';

export interface SignalStats {
  signal: string;
  trades: number;
  winRate: number; // percentage (0-100)
  avgPnl: number;
  avgPnlPct: number;
  lift: number; // Signal WR - Baseline WR
  confidence: 'Low' | 'Medium' | 'High'; // <30, 30-100, 100+
}

export interface AnalyticsResult {
  baselineTrades: number;
  baselineWinRate: number;
  signals: SignalStats[];
}

interface JournalRow {
  pnl: number | null;
  pnlPct: number | null;
  signalSummary: string | null;
}

/**
 * Pure aggregation — no DB dependency, fully unit-testable.
 */
export function aggregateSignalAnalytics(journals: JournalRow[]): AnalyticsResult {
  if (journals.length === 0) {
    return { baselineTrades: 0, baselineWinRate: 0, signals: [] };
  }

  const baselineTrades = journals.length;
  const baselineWins = journals.filter(j => (j.pnl ?? 0) > 0).length;
  const baselineWinRate = (baselineWins / baselineTrades) * 100;

  const signalMap = new Map<string, { count: number; wins: number; totalPnl: number; totalPnlPct: number }>();

  for (const j of journals) {
    if (!j.signalSummary) continue;

    const pnl = j.pnl ?? 0;
    const pnlPct = j.pnlPct ?? 0;
    const isWin = pnl > 0;

    const signals = j.signalSummary.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);

    for (const sig of signals) {
      if (!signalMap.has(sig)) {
        signalMap.set(sig, { count: 0, wins: 0, totalPnl: 0, totalPnlPct: 0 });
      }
      const stats = signalMap.get(sig)!;
      stats.count++;
      if (isWin) stats.wins++;
      stats.totalPnl += pnl;
      stats.totalPnlPct += pnlPct;
    }
  }

  const signalsList: SignalStats[] = [];

  for (const [signal, stats] of signalMap.entries()) {
    const winRate = (stats.wins / stats.count) * 100;
    const lift = winRate - baselineWinRate;

    let confidence: 'Low' | 'Medium' | 'High' = 'Low';
    if (stats.count >= 100) confidence = 'High';
    else if (stats.count >= 30) confidence = 'Medium';

    signalsList.push({
      signal,
      trades: stats.count,
      winRate,
      avgPnl: stats.totalPnl / stats.count,
      avgPnlPct: stats.totalPnlPct / stats.count,
      lift,
      confidence
    });
  }

  signalsList.sort((a, b) => b.trades - a.trades);

  return { baselineTrades, baselineWinRate, signals: signalsList };
}

export class AnalyticsService {
  /**
   * Fetches closed TradeJournal entries and delegates to the pure aggregation helper.
   * Only includes closed trades (where pnl is not null).
   */
  static async getSignalAnalytics(): Promise<AnalyticsResult> {
    const journals = await prisma.tradeJournal.findMany({
      where: { pnl: { not: null } },
      select: { pnl: true, pnlPct: true, signalSummary: true }
    });
    return aggregateSignalAnalytics(journals);
  }
}
