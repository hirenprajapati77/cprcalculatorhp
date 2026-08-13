import { prisma } from '@/lib/db';
import { env } from '@/config/env';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { MarketService } from '@/services/market.service';
import { evaluateCprSetupPriceStaleness } from '@/services/alert/breakout-price-gate';
import { inferCprJournalDirection } from '@/lib/cpr-direction';

export { inferCprJournalDirection } from '@/lib/cpr-direction';

export type CprJournalJobResult = {
  success: boolean;
  logged: string[];
  skipped: string[];
  message?: string;
};

/**
 * Shared CPR journal pipeline for cron route and in-process scheduler.
 * Note: Claim lock is handled at the caller/entry point (route/scheduler) to prevent double-locking.
 */
export async function runCprJournalJob(): Promise<CprJournalJobResult> {
  const todayStr = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });

  const maxSignals = env.CPR_JOURNAL_MAX_SIGNALS;

  // Count all qualifying signals (uncapped) so we can log exactly what the
  // cap below cuts, instead of silently truncating.
  const qualifyingCount = await prisma.scannerResult.count({
    where: {
      date: todayStr,
      score: { gte: 75 },
      NOT: { symbol: { endsWith: ':BSE' } },
    },
  });

  const topSignals = await prisma.scannerResult.findMany({
    where: {
      date: todayStr,
      score: { gte: 75 },
      NOT: { symbol: { endsWith: ':BSE' } },
    },
    orderBy: { score: 'desc' },
    take: maxSignals,
  });

  if (qualifyingCount > topSignals.length) {
    console.log(
      `[CPRJournal] ${qualifyingCount - topSignals.length} qualifying signal(s) cut by ` +
      `CPR_JOURNAL_MAX_SIGNALS=${maxSignals} (${qualifyingCount} qualified today)`
    );
  }

  if (topSignals.length === 0) {
    return {
      success: false,
      logged: [],
      skipped: [],
      message: 'No CPR signals with score >= 75 today',
    };
  }

  const logged: string[] = [];
  const skipped: string[] = [];

  // ── Parallel stock processing ────────────────────────────────────────────
  const processResults = await Promise.allSettled(
    topSignals.map(async (signal) => {
      // Sanitize once up front so the symbol used to fetch the option
      // suggestion (and thus the prefix baked into formattedName) matches the
      // symbol used to strip that prefix back off below. The DB query already
      // excludes ':BSE' symbols as defense in depth, but this must not rely
      // on that filter to stay correct.
      const cleanSym = signal.symbol.split(':')[0].trim();

      const tag = inferCprJournalDirection(signal);
      const isBearish = tag === 'SHORT';

      // Entry is the breakout-continuation / mean-revert trigger.
      // Bullish must hold ABOVE entry; bearish must hold BELOW entry.
      const triggered = isBearish ? signal.ltp <= signal.entry : signal.ltp >= signal.entry;
      if (!triggered) {
        console.log(
          `[CPRJournal] ${signal.symbol} not triggered: LTP ${signal.ltp} vs Entry ${signal.entry} (${tag})`
        );
        return { tag: signal.symbol, didLog: false };
      }

      // SECTOR_DIVERGENCE is baked into signalSummary by SectorRegimeService at
      // scan time. In live mode, skip journaling — the stock's own sector was
      // net-bearish that day. Shadow mode logs only, never blocks.
      const hasSectorDivergence = signal.signalSummary?.includes('SECTOR_DIVERGENCE') ?? false;
      if (hasSectorDivergence && env.SECTOR_FILTER_MODE === 'live') {
        console.log(`[CPRJournal] ${signal.symbol} skipped: sector divergence (live mode)`);
        return { tag: signal.symbol, didLog: false };
      }

      // Gap / extension gate — same helpers as breakout Telegram pre-send.
      // Prefer live OHLC from MarketService; fall back to entry-chase on signal.ltp alone.
      let todayHigh = 0;
      let todayLow = 0;
      let previousClose: number | undefined;
      let open: number | undefined;
      let liveLtp = signal.ltp;
      try {
        const stockData = await MarketService.getStockData(cleanSym, 'NSE');
        if (stockData) {
          todayHigh = stockData.high || 0;
          todayLow = stockData.low || 0;
          previousClose = stockData.previousClose;
          open = stockData.open;
          if (stockData.ltp > 0) liveLtp = stockData.ltp;
        }
      } catch (mktErr) {
        console.warn(`[CPRJournal] Market data fetch failed for ${signal.symbol}:`, mktErr);
      }

      const staleness = evaluateCprSetupPriceStaleness({
        entry: signal.entry,
        ltp: liveLtp,
        direction: tag,
        todayHigh,
        todayLow,
        ...(previousClose != null ? { previousClose } : {}),
        ...(open != null ? { open } : {}),
        symbol: signal.symbol,
      });
      if (staleness.stale) {
        console.warn(
          `[CPRJournal] ${signal.symbol} skipped (${staleness.reason}): ${staleness.detail}`
        );
        return { tag: `${signal.symbol}:${staleness.reason}`, didLog: false };
      }

      const fallbackOptionType = isBearish ? 'PE' : 'CE';
      let optionName: string;
      let optionStrike: number;
      let optionType: 'CE' | 'PE';
      let entryCmp: number;
      let optionExpiry: string | undefined;

      try {
        const suggestion = await OptionSuggestionService.suggestOptionForBtst(
          cleanSym,
          liveLtp,
          tag,
          signal.entry,
          signal.sl,
          signal.target,
          todayStr
        );

        if (!suggestion.error && suggestion.strike && suggestion.ltp) {
          optionType = suggestion.type ?? fallbackOptionType;
          optionName =
            suggestion.formattedName?.replace(new RegExp(`^${cleanSym}\\s+`), '') ||
            `${suggestion.strike} ${optionType}`;
          optionStrike = suggestion.strike;
          entryCmp = suggestion.ltp;
          // Extract and store expiry so captureSnapshot never needs to parse it
          const fn = suggestion.formattedName ?? '';
          const wm = fn.match(/\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(20\d{2})\b/);
          const mm = fn.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(20\d{2})\b/);
          optionExpiry = wm ? `${wm[1]} ${wm[2]} ${wm[3]}` : mm ? `${mm[1]} ${mm[2]}` : undefined;
        } else {
          console.warn(
            `[CPRJournal] No option suggestion for ${signal.symbol}: ` +
            (suggestion.error ?? 'missing strike or ltp') +
            ' — journaling UNDERLYING stock LTP.'
          );
          optionType = fallbackOptionType;
          optionName = TradeJournalService.underlyingOptionContract(optionType);
          optionStrike = 0;
          entryCmp = liveLtp;
        }
      } catch (optErr) {
        console.warn(
          `[CPRJournal] Option lookup threw for ${signal.symbol}:`,
          optErr,
          '— journaling UNDERLYING stock LTP.'
        );
        optionType = fallbackOptionType;
        optionName = TradeJournalService.underlyingOptionContract(optionType);
        optionStrike = 0;
        entryCmp = liveLtp;
      }

      const didLog = await TradeJournalService.logSignal({
        signalType: 'CPR',
        symbol: signal.symbol,
        optionContract: optionName,
        optionStrike,
        optionType,
        ...(optionExpiry ? { optionExpiry } : {}),
        entryCmp,
        score: signal.score,
        confidence: signal.confidence,
        signalSummary: signal.signalSummary,
      });

      return { tag: signal.symbol, didLog };
    })
  );

  topSignals.forEach((signal, i) => {
    const res = processResults[i];
    if (res.status === 'fulfilled') {
      if (res.value.didLog) logged.push(res.value.tag);
      else skipped.push(res.value.tag);
    } else {
      console.error(`[CPRJournal] Unexpected processing error for pick ${signal.symbol}:`, res.reason);
      skipped.push(`${signal.symbol}:UNCAUGHT_ERROR`);
    }
  });

  return { success: logged.length > 0, logged, skipped };
}
