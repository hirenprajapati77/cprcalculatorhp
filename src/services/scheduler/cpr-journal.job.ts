import { prisma } from '@/lib/db';
import { env } from '@/config/env';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { MarketService } from '@/services/market.service';
import { evaluateCprSetupPriceStaleness } from '@/services/alert/breakout-price-gate';
import { optionPcrContradictsDirection } from '@/services/alert/breakout-pcr-gate';
import { cprDirectionToOptionBias, inferCprJournalDirection, validateCprSignalConfluence } from '@/lib/cpr-direction';
import { RegimeService } from '@/services/overnight/regime.service';
import { getAtrPct } from '@/lib/atr';
import { getCompletedHistory } from '@/lib/market-hours';

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

  // ── Market Regime Gate ────────────────────────────────────────────────────
  // Mirrors btst-journal.job.ts L90-96: suppress counter-trend signals to avoid
  // buying PEs in a Bull market or CEs in a Bear market (root cause of FORTIS loss).
  // When regime.reliable === false (Nifty history unavailable), suppress BOTH
  // directions (fail-closed) rather than treating unknown as CHOPPY/neutral.
  const regime = await RegimeService.getMarketRegime(todayStr);
  const regimeUnknown = regime.reliable === false;
  const suppressShort = regime.trend === 'BULL' || regimeUnknown; // No PE/Short in Bull
  const suppressLong  = regime.trend === 'BEAR' || regimeUnknown; // No CE/Long in Bear
  console.log(
    `[CPRJournal] Regime: ${regime.trend} (score ${regime.score}, reliable=${regime.reliable ?? true}) ` +
    `→ suppressShort=${suppressShort} suppressLong=${suppressLong}`
  );

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

  const topSignalsRaw = await prisma.scannerResult.findMany({
    where: {
      date: todayStr,
      score: { gte: 75 },
      NOT: { symbol: { endsWith: ':BSE' } },
    },
    // H2 fix: stable tie-breaker prevents non-deterministic ordering when
    // multiple rows share the same score (common in same-date rescans).
    orderBy: [{ score: 'desc' }, { symbol: 'asc' }],
    // Over-fetch slightly to leave room for symbol dedup below.
    take: maxSignals * 3,
  });

  // H2 fix: deduplicate by symbol (same stock can appear multiple times from
  // multiple intraday rescans). Concurrent upserts on duplicate symbols in
  // Promise.allSettled cause Prisma P2002 unique constraint violations.
  const seenSymbols = new Set<string>();
  const topSignals = topSignalsRaw
    .filter((s) => {
      const sym = s.symbol.split(':')[0].trim();
      if (seenSymbols.has(sym)) return false;
      seenSymbols.add(sym);
      return true;
    })
    .slice(0, maxSignals);

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

      // ── Fix 1: Market Regime Suppression ─────────────────────────────────
      // Full suppression: no SHORT (PE) in Bull market, no LONG (CE) in Bear market.
      // When regime is unreliable (Nifty data missing), both are suppressed (fail-closed).
      // This is the #1 guard against FORTIS-type overnight counter-trend option losses.
      if (isBearish && suppressShort) {
        console.log(
          `[CPRJournal] ${signal.symbol} suppressed: SHORT (PE) while market regime is ${regime.trend} — skipping.`
        );
        return { tag: `${signal.symbol}:REGIME_SUPPRESSED`, didLog: false };
      }
      if (!isBearish && suppressLong) {
        console.log(
          `[CPRJournal] ${signal.symbol} suppressed: LONG (CE) while market regime is ${regime.trend} — skipping.`
        );
        return { tag: `${signal.symbol}:REGIME_SUPPRESSED`, didLog: false };
      }

      // ── Fix 2: Signal Confluence / Direction Contradiction ────────────────
      // Reject setups where the morning tag explicitly contradicts the trade direction.
      // e.g. GAP_UP on a SHORT setup means the stock already moved against the bear thesis.
      const confluenceCheck = validateCprSignalConfluence(signal.signalSummary, tag);
      if (!confluenceCheck.valid) {
        console.log(
          `[CPRJournal] ${signal.symbol} skipped: ${confluenceCheck.reason} — direction ${tag} contradicted by morning signal.`
        );
        return { tag: `${signal.symbol}:${confluenceCheck.reason}`, didLog: false };
      }

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
      let atrPct: number | undefined;
      try {
        const stockData = await MarketService.getStockData(cleanSym, 'NSE');
        if (stockData) {
          todayHigh = stockData.high || 0;
          todayLow = stockData.low || 0;
          previousClose = stockData.previousClose;
          open = stockData.open;
          if (stockData.ltp > 0) liveLtp = stockData.ltp;
          if (stockData.history && stockData.history.length > 0) {
            atrPct = getAtrPct(getCompletedHistory(stockData.history), liveLtp) * 100;
          }
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
        ...(atrPct != null ? { atrPct } : {}),
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
        // C2 fix: CPR journal matches breakout-alert.pipeline.ts by calling suggestOption
        // (mapping LONG/SHORT → BULLISH/BEARISH) rather than suggestOptionForBtst.
        // Currently both methods are functionally identical because INDEX_BTST_PREFER_DEEPER_ITM
        // is false, but using the correct method prevents a future discrepancy if deeper ITM is re-enabled.
        const suggestion = await OptionSuggestionService.suggestOption(
          cleanSym,
          liveLtp,
          cprDirectionToOptionBias(tag),
          signal.entry,
          signal.sl,
          signal.target,
          todayStr
        );

        if (!suggestion.error && optionPcrContradictsDirection(suggestion.type, suggestion.pcr)) {
          console.warn(
            `[CPRJournal] ${signal.symbol} skipped (PCR_CONTRADICTS): ${suggestion.type} vs chain PCR ${suggestion.pcr}`
          );
          return { tag: `${signal.symbol}:PCR_CONTRADICTS`, didLog: false };
        }

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

  return { success: true, logged, skipped };
}
