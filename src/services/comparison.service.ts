import { prisma } from '@/lib/db';
import type { ScannerResult } from '@prisma/client';

export interface ComparisonMetric {
  symbol: string;
  sector: string;
  price: number;
  width: number;
  score: number;
  classification: string;
  signals: string[];
  history: {
    date: string;
    ltp: number;
    width: number;
    score: number;
  }[];
}

export class ComparisonService {
  /**
   * Generates comparative overlays for up to 5 stocks.
   */
  static async compareStocks(symbols: string[]): Promise<ComparisonMetric[]> {
    const cleanSymbols = symbols.map(s => s.trim().toUpperCase()).slice(0, 5);
    
    if (cleanSymbols.length === 0) return [];

    const results = await Promise.all(
      cleanSymbols.map(async (symbol) => {
        try {
          // Fetch the latest 20 scans for each stock
          const history = await prisma.scannerResult.findMany({
            where: {
              OR: [
                { symbol },
                { symbol: `${symbol}:BSE` }
              ]
            },
            orderBy: { date: 'desc' },
            take: 20,
          });

          if (history.length === 0) return null;

          const current = history[0];
          
          // Get metadata snapshot for sector
          const snapshot = await prisma.marketSnapshot.findUnique({
            where: { symbol: current.symbol },
          });

          return {
            symbol,
            sector: snapshot?.sector || 'Other',
            price: current.ltp,
            width: current.width,
            score: current.score,
            classification: current.classification,
            signals: current.signalSummary ? current.signalSummary.split(',') : [],
            history: history.map((h: ScannerResult) => ({
              date: h.date,
              ltp: h.ltp,
              width: h.width,
              score: h.score,
            })),
          };
        } catch (err) {
          console.error(`Comparison Service failed for ${symbol}:`, err);
          return null;
        }
      })
    );

    return results.filter((r): r is ComparisonMetric => r !== null);
  }
}
