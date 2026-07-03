import { prisma } from '@/lib/db';

export class JournalService {
  /**
   * Bulk inserts journal events up to the hard limit of 100 per trade.
   */
  static async logEvents(tradeId: string, events: Array<{ event: string, timestamp: Date, details: string }>) {
    // Limit to 100 events to prevent payload bloat
    const limitedEvents = events.slice(0, 100);
    
    await prisma.journal.createMany({
      data: limitedEvents.map(e => ({
        tradeId,
        timestamp: e.timestamp,
        event: e.event,
        details: e.details
      }))
    });
  }
}
