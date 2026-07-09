import { prisma } from '@/lib/db';

export interface EventRiskResult {
  severity: number;           // 0 to 100 (100 = critical event tomorrow)
  reason: string | null;      // e.g., 'EARNINGS_TOMORROW'
  source: string;             // e.g., 'LOCAL_DB'
  confidence: 'HIGH' | 'LOW' | 'UNKNOWN';
}

export class EventCalendarService {
  /**
   * Evaluates near-term corporate event risk (e.g. Earnings) for a specific stock.
   */
  static async getEventRisk(symbol: string, signalDate: string): Promise<EventRiskResult> {
    try {
      const todayDate = new Date(signalDate);
      const threeDaysFromNow = new Date(todayDate);
      threeDaysFromNow.setDate(todayDate.getDate() + 3);

      const todayStr = signalDate;
      const futureStr = threeDaysFromNow.toISOString().split('T')[0];

      const events = await prisma.marketEvent.findMany({
        where: {
          symbol: symbol,
          date: {
            gte: todayStr,
            lte: futureStr
          }
        }
      });

      if (events.length > 0) {
        // Find the most severe event
        let highestSeverity = 0;
        let reason = null;

        for (const event of events) {
          const severity = event.impact === 'HIGH' ? 100 : (event.impact === 'MEDIUM' ? 70 : 30);
          if (severity > highestSeverity) {
            highestSeverity = severity;
            const daysAway = this.daysBetween(todayStr, event.date);
            const timeFrame = daysAway === 0 ? 'TODAY' : (daysAway === 1 ? 'TOMORROW' : `IN_${daysAway}_DAYS`);
            reason = `${event.eventType}_${timeFrame}`;
          }
        }

        return {
          severity: highestSeverity,
          reason,
          source: 'LOCAL_DB',
          confidence: 'HIGH'
        };
      }

      // Check Calendar Freshness relative to signalDate
      const latestGlobalEvent = await prisma.marketEvent.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });
      
      const isHistoricalMode = process.env.HISTORICAL_MODE === 'mock' || process.env.HISTORICAL_MODE === 'db';
      
      let isCalendarStale = false;
      if (!isHistoricalMode) {
         if (!latestGlobalEvent) {
           isCalendarStale = true;
         } else {
           const diffHours = (Date.now() - latestGlobalEvent.createdAt.getTime()) / (1000 * 60 * 60);
           if (diffHours > 72) isCalendarStale = true;
         }
      }

      if (isCalendarStale) {
        console.warn(`[EventCalendarService] Calendar is STALE or EMPTY. Applying conservative 100 risk for ${symbol}.`);
        return {
          severity: 100,
          reason: 'STALE_CALENDAR_FALLBACK',
          source: 'ERROR',
          confidence: 'LOW'
        };
      }

      // If calendar is fresh, we safely assume 0 risk for this symbol
      return {
        severity: 0,
        reason: null,
        source: 'LOCAL_DB',
        confidence: 'HIGH'
      };

    } catch (err) {
      console.error(`[EventCalendarService] Error fetching events for ${symbol}:`, err);
      return {
        severity: 100, // CONSERVATIVE FALLBACK
        reason: 'DB_FETCH_ERROR',
        source: 'ERROR',
        confidence: 'UNKNOWN'
      };
    }
  }

  /**
   * Evaluates near-term macro event risk (e.g. RBI/Fed Policy).
   */
  static async getMacroEventRisk(signalDate: string): Promise<EventRiskResult> {
    return this.getEventRisk('MACRO', signalDate);
  }

  private static daysBetween(startStr: string, endStr: string): number {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Bulk fetches event risk for multiple symbols to prevent N+1 queries.
   */
  static async getBulkEventRisk(symbols: string[], signalDate: string): Promise<Record<string, EventRiskResult>> {
    const result: Record<string, EventRiskResult> = {};
    
    // Initialize defaults to conservative 100 if we cannot verify calendar health later
    for (const sym of symbols) {
      result[sym] = { severity: 100, reason: 'UNVERIFIED_CALENDAR', source: 'LOCAL_DB', confidence: 'UNKNOWN' };
    }

    try {
      const todayDate = new Date(signalDate);
      const threeDaysFromNow = new Date(todayDate);
      threeDaysFromNow.setDate(todayDate.getDate() + 3);

      const todayStr = signalDate;
      const futureStr = threeDaysFromNow.toISOString().split('T')[0];

      const events = await prisma.marketEvent.findMany({
        where: {
          symbol: { in: symbols },
          date: { gte: todayStr, lte: futureStr }
        }
      });

      for (const event of events) {
        const severity = event.impact === 'HIGH' ? 100 : (event.impact === 'MEDIUM' ? 70 : 30);
        const currentRisk = result[event.symbol];
        
        if (currentRisk.reason === 'UNVERIFIED_CALENDAR' || severity > currentRisk.severity) {
          currentRisk.severity = severity;
          const daysAway = this.daysBetween(todayStr, event.date);
          const timeFrame = daysAway === 0 ? 'TODAY' : (daysAway === 1 ? 'TOMORROW' : `IN_${daysAway}_DAYS`);
          currentRisk.reason = `${event.eventType}_${timeFrame}`;
          currentRisk.confidence = 'HIGH';
        }
      }
      // Add freshness check logic matching getEventRisk (using createdAt instead of lastUpdated to avoid compilation error)
      const latestGlobalEvent = await prisma.marketEvent.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      });
      
      const isHistoricalMode = process.env.HISTORICAL_MODE === 'mock' || process.env.HISTORICAL_MODE === 'db';
      
      let isCalendarStale = false;
      if (!isHistoricalMode) {
         if (!latestGlobalEvent) {
           isCalendarStale = true;
         } else {
           const diffHours = (Date.now() - latestGlobalEvent.createdAt.getTime()) / (1000 * 60 * 60);
           if (diffHours > 72) isCalendarStale = true;
         }
      }

      for (const sym of symbols) {
        if (result[sym].reason === 'UNVERIFIED_CALENDAR') {
          if (!isCalendarStale) {
            result[sym] = { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'HIGH' };
          } else {
            result[sym].reason = 'STALE_CALENDAR_FALLBACK';
            result[sym].confidence = 'LOW';
            // severity stays 100
          }
        }
      }

    } catch (err) {
      console.error(`[EventCalendarService] Error bulk fetching events:`, err);
      // Fallback to CONSERVATIVE 100
      for (const sym of symbols) {
        result[sym] = { severity: 100, reason: 'DB_FETCH_ERROR', source: 'ERROR', confidence: 'UNKNOWN' };
      }
    }
    
    return result;
  }
}
