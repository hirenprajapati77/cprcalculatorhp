import { PrismaClient } from '@prisma/client';
import { HistoricalProvider } from './historical.provider';

const prisma = new PrismaClient();

export class ReplayService {
  /**
   * Generates replay payload on demand. 
   * Strict limits: max 500 candles, max 100 events.
   * Extracts only entry-20 to exit+20 window.
   */
  static async getReplayPayload(tradeId: string) {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      include: { journal: { orderBy: { timestamp: 'asc' } } }
    });

    if (!trade) throw new Error('Trade not found');

    const rawEvents = trade.journal;
    let events = rawEvents;
    let truncatedEvents = false;

    if (events.length > 100) {
      events = events.slice(0, 100);
      truncatedEvents = true;
    }

    const startDate = new Date(trade.entryDate);
    // Approximate 20 trading days roughly as 30 calendar days
    startDate.setDate(startDate.getDate() - 30); 
    
    const endDate = trade.exitDate ? new Date(trade.exitDate) : new Date();
    endDate.setDate(endDate.getDate() + 30);

    let ohlc = await HistoricalProvider.getHistory(trade.symbol, startDate, endDate);
    let truncatedCandles = false;

    if (ohlc.length > 500) {
      ohlc = ohlc.slice(0, 500);
      truncatedCandles = true;
    }

    return {
      tradeId: trade.id,
      symbol: trade.symbol,
      type: trade.type,
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss,
      target: trade.target,
      exitPrice: trade.exitPrice,
      riskAmount: trade.riskAmount,
      positionSize: trade.positionSize,
      ohlc,
      events,
      truncated: truncatedEvents || truncatedCandles
    };
  }
}
