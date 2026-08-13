import { env } from '@/config/env';
import { prisma } from '@/lib/db';
import { DatabaseCircuitBreaker } from '@/lib/circuit-breaker';
import { getISTTime } from '@/lib/market-hours';

export interface EventRiskResult {
  severity: number;           // 0 to 100 (100 = critical event today)
  reason: string | null;      // e.g., 'EARNINGS_NEXT_SESSION'
  source: string;             // e.g., 'LOCAL_DB'
  confidence: 'HIGH' | 'LOW' | 'UNKNOWN';
}

/** How many NSE trading sessions ahead to query/decay event risk. */
export const EVENT_LOOKAHEAD_TRADING_DAYS = 3;

/** Base impact score, then -10 per trading session so HIGH at session+3 falls below option gate (80). */
export function eventImpactSeverity(impact: string, tradingSessionsAway: number): number {
  const base = impact === 'HIGH' ? 100 : impact === 'MEDIUM' ? 70 : 30;
  const decayDays = Math.max(0, tradingSessionsAway);
  return Math.max(0, base - 10 * decayDays);
}

function formatTradingTimeFrame(tradingSessionsAway: number): string {
  if (tradingSessionsAway <= 0) return 'TODAY';
  if (tradingSessionsAway === 1) return 'NEXT_SESSION';
  return `IN_${tradingSessionsAway}_SESSIONS`;
}

function utcMidnightFromDateStr(dateStr: string): number | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return null;
  return Date.UTC(y, m - 1, d);
}

function dateStrFromUtcMidnight(utcMs: number): string {
  const dt = new Date(utcMs);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export class EventCalendarService {
  /**
   * Evaluates near-term corporate event risk (e.g. Earnings) for a specific stock.
   */
  static async getEventRisk(symbol: string, signalDate: string): Promise<EventRiskResult> {
    try {
      const todayStr = signalDate;
      const futureStr = this.addTradingDays(todayStr, EVENT_LOOKAHEAD_TRADING_DAYS);

      const events = await DatabaseCircuitBreaker.execute(() => prisma.marketEvent.findMany({
        where: {
          symbol: symbol,
          date: {
            gte: todayStr,
            lte: futureStr
          }
        }
      }));

      if (events.length > 0) {
        // Find the most severe event
        let highestSeverity = 0;
        let reason = null;

        for (const event of events) {
          const sessionsAway = this.daysBetween(todayStr, event.date);
          if (sessionsAway > EVENT_LOOKAHEAD_TRADING_DAYS) continue;
          const severity = eventImpactSeverity(event.impact, sessionsAway);
          if (severity > highestSeverity) {
            highestSeverity = severity;
            reason = `${event.eventType}_${formatTradingTimeFrame(sessionsAway)}`;
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
      const latestGlobalEvent = await DatabaseCircuitBreaker.execute(() => prisma.marketEvent.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      }));
      
      const historicalMode = env.HISTORICAL_MODE || 'mock';
      const isHistoricalMode = historicalMode === 'mock' || historicalMode === 'db';
      // marketEvent has no populator yet, so freshness enforcement must be opt-in.
      const enforceFreshness = env.EVENT_CALENDAR_ENFORCE_FRESHNESS === 'true';

      let isCalendarStale = false;
      if (!isHistoricalMode && enforceFreshness) {
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

      // If calendar is fresh but has absolutely no entries, we are in an unverified state
      return {
        severity: 0,
        reason: null,
        source: 'LOCAL_DB',
        confidence: latestGlobalEvent ? 'HIGH' : 'UNKNOWN'
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

  /**
   * Advance `startStr` by N NSE trading sessions (skips weekends/holidays).
   * N=0 returns startStr. N=1 returns the next trading day.
   */
  static addTradingDays(startStr: string, tradingDays: number): string {
    const startUtc = utcMidnightFromDateStr(startStr);
    if (startUtc == null) return startStr;
    if (tradingDays <= 0) return startStr;

    const msPerDay = 1000 * 60 * 60 * 24;
    let currentUtc = startUtc;
    let remaining = tradingDays;
    let safety = 0;

    while (remaining > 0 && safety < 365) {
      currentUtc += msPerDay;
      if (getISTTime(new Date(currentUtc)).isTradingDay) {
        remaining--;
      }
      safety++;
    }

    return dateStrFromUtcMidnight(currentUtc);
  }

  /**
   * Count NSE trading sessions strictly after startStr up to and including endStr.
   * Same day → 0; next trading session → 1. Public for unit tests.
   */
  static daysBetween(startStr: string, endStr: string): number {
    const startUtc = utcMidnightFromDateStr(startStr);
    const endUtc = utcMidnightFromDateStr(endStr);
    if (startUtc == null || endUtc == null) return 0;
    
    // Start iterating from startStr + 1 day, count trading days up to and including endStr.
    let tradingDays = 0;
    const msPerDay = 1000 * 60 * 60 * 24;
    let currentUtc = startUtc + msPerDay;
    let safety = 0;
    
    while (currentUtc <= endUtc && safety < 365) {
      if (getISTTime(new Date(currentUtc)).isTradingDay) {
        tradingDays++;
      }
      currentUtc += msPerDay;
      safety++;
    }
    
    return tradingDays;
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
      const todayStr = signalDate;
      const futureStr = this.addTradingDays(todayStr, EVENT_LOOKAHEAD_TRADING_DAYS);

      const events = await DatabaseCircuitBreaker.execute(() => prisma.marketEvent.findMany({
        where: {
          symbol: { in: symbols },
          date: { gte: todayStr, lte: futureStr }
        }
      }));

      for (const event of events) {
        const sessionsAway = this.daysBetween(todayStr, event.date);
        if (sessionsAway > EVENT_LOOKAHEAD_TRADING_DAYS) continue;
        const severity = eventImpactSeverity(event.impact, sessionsAway);
        const currentRisk = result[event.symbol];
        
        if (currentRisk.reason === 'UNVERIFIED_CALENDAR' || severity > currentRisk.severity) {
          currentRisk.severity = severity;
          currentRisk.reason = `${event.eventType}_${formatTradingTimeFrame(sessionsAway)}`;
          currentRisk.confidence = 'HIGH';
        }
      }
      // Add freshness check logic matching getEventRisk (using createdAt instead of lastUpdated to avoid compilation error)
      // Optimization: Only query global event freshness if there is at least one unverified calendar check
      const hasUnverified = symbols.some(sym => result[sym].reason === 'UNVERIFIED_CALENDAR');
      let isCalendarStale = false;
      let latestGlobalEvent = null;

      if (hasUnverified) {
        latestGlobalEvent = await DatabaseCircuitBreaker.execute(() => prisma.marketEvent.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true }
        }));
        
        const historicalMode = env.HISTORICAL_MODE || 'mock';
        const isHistoricalMode = historicalMode === 'mock' || historicalMode === 'db';
        // marketEvent has no populator yet, so freshness enforcement must be opt-in.
        const enforceFreshness = env.EVENT_CALENDAR_ENFORCE_FRESHNESS === 'true';

        if (!isHistoricalMode && enforceFreshness) {
           if (!latestGlobalEvent) {
             isCalendarStale = true;
           } else {
             const diffHours = (Date.now() - latestGlobalEvent.createdAt.getTime()) / (1000 * 60 * 60);
             if (diffHours > 72) isCalendarStale = true;
           }
         }
      }

      for (const sym of symbols) {
        if (result[sym].reason === 'UNVERIFIED_CALENDAR') {
          if (!isCalendarStale) {
            result[sym] = { 
              severity: 0, 
              reason: null, 
              source: 'LOCAL_DB', 
              confidence: latestGlobalEvent ? 'HIGH' : 'UNKNOWN' 
            };
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
