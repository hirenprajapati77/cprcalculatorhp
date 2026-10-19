import { MultiYearBreakoutService, type BreakoutStock, type MultiYearBreakoutReport } from '@/services/market-tools/multi-year-breakout.service';
import { PatternBreakoutService, type PatternBreakoutStock, type PatternBreakoutReport } from '@/services/market-tools/pattern-breakout.service';
import { MomentumLeadersService, type MomentumStock, type MomentumLeadersReport } from '@/services/market-tools/momentum-leaders.service';
import { TelegramService, escapeTelegramHtml } from '@/services/alert/telegram.service';
import {
  getISTDateString,
  isNseTradingDay,
  getNextNseTradingDay,
} from '@/lib/market-hours';

export interface WatchCandidate {
  symbol: string;
  sector: string;
  module: 'MULTI_YEAR' | 'PATTERN' | 'MOMENTUM';
  structuralPivot?: number | null | undefined;
  structuralPivotLabel?: string | undefined;
  previousClose: number;
  setupDetail: string;
  context: string;
  crossModuleTags?: string[] | undefined;
}

export interface WatchReportResult {
  ready: boolean;
  reason?: string | undefined;
  scanDate?: string | undefined;
  nextSessionDate?: string | undefined;
  candidates?: WatchCandidate[] | undefined;
  candidateCount?: number | undefined;
  message?: string | undefined;
}

export interface DispatchWatchAlertsOptions {
  dryRun?: boolean | undefined;
  forceDate?: string | undefined;
  maxCandidates?: number | undefined;
}

export interface DispatchWatchAlertsResult {
  success: boolean;
  sent: boolean;
  dryRun?: boolean | undefined;
  deliveryStatus?: 'delivered' | 'delivery_unknown' | 'failed' | 'not_sent' | undefined;
  reportId?: string | undefined;
  reason?: string | undefined;
  scanDate?: string | undefined;
  nextSessionDate?: string | undefined;
  candidateCount?: number | undefined;
  message?: string | undefined;
  recipient?: string | undefined;
}

const DEFAULT_MAX_CANDIDATES = 12;

export class MarketToolsWatchService {
  /**
   * Assembles a structured WATCH report from the 3 Market Tools precomputes.
   * Verifies precompute readiness and data freshness (date matching and status === 'ready').
   */
  static async assembleWatchReport(options?: {
    targetDate?: string | undefined;
    maxCandidates?: number | undefined;
    now?: Date | undefined;
  }): Promise<WatchReportResult> {
    const referenceDate = options?.now ?? new Date();
    const scanDate = options?.targetDate ?? getISTDateString(referenceDate);

    // Guard: Only run for actual trading days (Bhavcopy is generated on trading days)
    if (!options?.targetDate && !isNseTradingDay(referenceDate)) {
      return {
        ready: false,
        reason: 'not_a_trading_day',
      };
    }

    const nextSessionDate = getNextNseTradingDay(scanDate);

    // 1. Fetch precomputed reports from all 3 modules (cached in Redis / memory)
    let multiYear: MultiYearBreakoutReport;
    let pattern: PatternBreakoutReport;
    let momentum: MomentumLeadersReport;

    try {
      [multiYear, pattern, momentum] = await Promise.all([
        MultiYearBreakoutService.getBreakoutReport(false),
        PatternBreakoutService.getPatternBreakoutReport(false),
        MomentumLeadersService.getMomentumLeadersReport(false),
      ]);
    } catch (err) {
      console.error('[MarketToolsWatchService] Error fetching precomputed reports:', err);
      return {
        ready: false,
        reason: 'fetch_error',
      };
    }

    // 2. Freshness & Completion Verification
    const isMultiYearReady = multiYear.status === 'ready' && multiYear.freshness !== 'STALE' && multiYear.date === scanDate;
    const isPatternReady = pattern.status === 'ready' && pattern.freshness !== 'STALE' && pattern.date === scanDate;
    const isMomentumReady = momentum.status === 'ready' && momentum.freshness !== 'STALE' && momentum.date === scanDate;

    if (!isMultiYearReady || !isPatternReady || !isMomentumReady) {
      const pendingOrStale: string[] = [];
      if (!isMultiYearReady) pendingOrStale.push(`MultiYear(status=${multiYear.status}, date=${multiYear.date})`);
      if (!isPatternReady) pendingOrStale.push(`Pattern(status=${pattern.status}, date=${pattern.date})`);
      if (!isMomentumReady) pendingOrStale.push(`Momentum(status=${momentum.status}, date=${momentum.date})`);

      console.warn(
        `[MarketToolsWatchService] Precompute not ready or date mismatch for ${scanDate}. Modules: ${pendingOrStale.join(', ')}`
      );
      return {
        ready: false,
        reason: `precompute_not_ready: ${pendingOrStale.join(', ')}`,
      };
    }

    // 3. Candidate Selection & Global Cap Gating
    const maxTotal = options?.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
    const initialPerModuleCap = Math.max(1, Math.floor(maxTotal / 3));

    // A. Multi-Year Breakouts
    // Rank hierarchy: ATH > 10Y > 5Y > 3Y > 2Y > 1Y, then breakoutGainPct descending
    const windowRank: Record<string, number> = {
      ATH: 6,
      '10Y': 5,
      '5Y': 4,
      '3Y': 3,
      '2Y': 2,
      '1Y': 1,
    };

    const qualifyingMultiYear = (multiYear.stocks || [])
      .filter((s: BreakoutStock) => s.breakoutPrice !== null && s.strongestBreakout !== null && s.breakoutPrice > 0)
      .sort((a: BreakoutStock, b: BreakoutStock) => {
        const rankA = windowRank[a.strongestBreakout ?? ''] ?? 0;
        const rankB = windowRank[b.strongestBreakout ?? ''] ?? 0;
        if (rankB !== rankA) return rankB - rankA;
        return (b.breakoutGainPct ?? 0) - (a.breakoutGainPct ?? 0);
      });

    // B. 52W Pattern Breakouts
    // Filter to Tier A+ / A (Score >= 65), sorted by Total Score descending
    const qualifyingPatterns = (pattern.stocks || [])
      .filter((s: PatternBreakoutStock) => s.scoreBreakdown && s.scoreBreakdown.totalScore >= 65 && s.high52w > 0)
      .sort((a: PatternBreakoutStock, b: PatternBreakoutStock) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore);

    // C. Momentum Leaders
    // Filter out circuit-locked stocks, require leader in >= 3 windows, sorted by Composite Score
    const qualifyingMomentum = (momentum.topLeaders || [])
      .filter((s: MomentumStock) => !s.isCircuitLocked && s.leaderWindowCount >= 3)
      .sort((a: MomentumStock, b: MomentumStock) => b.compositeScore - a.compositeScore);

    // Cross-module deduplication & slot allocation
    const seenSymbols = new Set<string>();
    const candidates: WatchCandidate[] = [];

    // Helper to find cross-module tags
    const findCrossTags = (symbol: string, currentModule: string): string[] => {
      const tags: string[] = [];
      if (currentModule !== 'MULTI_YEAR' && qualifyingMultiYear.some(s => s.symbol === symbol)) {
        tags.push('Multi-Year Breakout');
      }
      if (currentModule !== 'PATTERN' && qualifyingPatterns.some(s => s.symbol === symbol)) {
        tags.push('52W Pattern');
      }
      if (currentModule !== 'MOMENTUM' && qualifyingMomentum.some(s => s.symbol === symbol)) {
        tags.push('Momentum Leader');
      }
      return tags;
    };

    const buildMultiYearCandidate = (s: BreakoutStock): WatchCandidate => ({
      symbol: s.symbol,
      sector: s.sector,
      module: 'MULTI_YEAR',
      structuralPivot: s.breakoutPrice!,
      structuralPivotLabel: `${s.strongestBreakout} High`,
      previousClose: s.close,
      setupDetail: `Breakout Window: ${s.strongestBreakout} (${s.breakoutGainPct !== null && s.breakoutGainPct > 0 ? `+${s.breakoutGainPct.toFixed(1)}%` : 'At Pivot'})`,
      context: `VPA: ${s.vpaFootprint?.label ?? 'Neutral'}${s.rvol20d !== null ? ` | RVOL: ${s.rvol20d.toFixed(1)}x` : ''}`,
      crossModuleTags: findCrossTags(s.symbol, 'MULTI_YEAR'),
    });

    const buildPatternCandidate = (s: PatternBreakoutStock): WatchCandidate => {
      const details = s.patternDetails;
      const baseInfo = details ? ` (Depth: ${details.baseDepthPct}%, ${details.baseDays}d base)` : '';
      return {
        symbol: s.symbol,
        sector: s.sector,
        module: 'PATTERN',
        structuralPivot: s.high52w,
        structuralPivotLabel: 'Reference: 52W High',
        previousClose: s.close,
        setupDetail: `${s.primaryPatternLabel} (Tier ${s.scoreBreakdown.qualityTier}, Score: ${s.scoreBreakdown.totalScore})${baseInfo}`,
        context: `Distance to High: ${s.distanceToHighPct > 0 ? `+${s.distanceToHighPct.toFixed(1)}%` : `${s.distanceToHighPct.toFixed(1)}%`} | VPA: ${s.vpaFootprint?.label ?? 'Neutral'}`,
        crossModuleTags: findCrossTags(s.symbol, 'PATTERN'),
      };
    };

    const buildMomentumCandidate = (s: MomentumStock): WatchCandidate => ({
      symbol: s.symbol,
      sector: s.sector,
      module: 'MOMENTUM',
      structuralPivot: null,
      structuralPivotLabel: 'Reference: Previous Close',
      previousClose: s.close,
      setupDetail: `Score: ${s.compositeScore} (Tier ${s.tier}) | Leader in ${s.leaderWindowCount}/4 Windows`,
      context: `1D: ${s.windows.w1d.returnPct > 0 ? '+' : ''}${s.windows.w1d.returnPct.toFixed(1)}% | 21D: ${s.windows.w21d.returnPct > 0 ? '+' : ''}${s.windows.w21d.returnPct.toFixed(1)}% | Avg TO: ₹${s.avgTurnoverCr20d.toFixed(1)} Cr`,
      crossModuleTags: findCrossTags(s.symbol, 'MOMENTUM'),
    });

    // Pass 1: Proportional allocation across modules up to initialPerModuleCap
    // Order of module priority: Multi-Year -> 52W Pattern -> Momentum Leaders
    for (const s of qualifyingMultiYear) {
      if (candidates.length >= maxTotal) break;
      if (candidates.filter(c => c.module === 'MULTI_YEAR').length >= initialPerModuleCap) break;
      if (seenSymbols.has(s.symbol)) continue;
      seenSymbols.add(s.symbol);
      candidates.push(buildMultiYearCandidate(s));
    }

    for (const s of qualifyingPatterns) {
      if (candidates.length >= maxTotal) break;
      if (candidates.filter(c => c.module === 'PATTERN').length >= initialPerModuleCap) break;
      if (seenSymbols.has(s.symbol)) continue;
      seenSymbols.add(s.symbol);
      candidates.push(buildPatternCandidate(s));
    }

    for (const s of qualifyingMomentum) {
      if (candidates.length >= maxTotal) break;
      if (candidates.filter(c => c.module === 'MOMENTUM').length >= initialPerModuleCap) break;
      if (seenSymbols.has(s.symbol)) continue;
      seenSymbols.add(s.symbol);
      candidates.push(buildMomentumCandidate(s));
    }

    // Pass 2: If total candidates < maxTotal, fill remaining slots from remaining qualified candidates
    // using deterministic priority: Multi-Year, then 52W Pattern, then Momentum Leaders
    if (candidates.length < maxTotal) {
      for (const s of qualifyingMultiYear) {
        if (candidates.length >= maxTotal) break;
        if (seenSymbols.has(s.symbol)) continue;
        seenSymbols.add(s.symbol);
        candidates.push(buildMultiYearCandidate(s));
      }
    }
    if (candidates.length < maxTotal) {
      for (const s of qualifyingPatterns) {
        if (candidates.length >= maxTotal) break;
        if (seenSymbols.has(s.symbol)) continue;
        seenSymbols.add(s.symbol);
        candidates.push(buildPatternCandidate(s));
      }
    }
    if (candidates.length < maxTotal) {
      for (const s of qualifyingMomentum) {
        if (candidates.length >= maxTotal) break;
        if (seenSymbols.has(s.symbol)) continue;
        seenSymbols.add(s.symbol);
        candidates.push(buildMomentumCandidate(s));
      }
    }

    // 4. Format Telegram HTML message
    const message = this.formatTelegramMessage({
      scanDate,
      nextSessionDate,
      candidates,
    });

    return {
      ready: true,
      scanDate,
      nextSessionDate,
      candidates,
      candidateCount: candidates.length,
      message,
    };
  }

  /**
   * Formats the WATCH message strictly in Telegram HTML format.
   * Adheres to honest labeling: no invented entry/SL/target levels.
   */
  static formatTelegramMessage(params: {
    scanDate: string;
    nextSessionDate: string;
    candidates: WatchCandidate[];
  }): string {
    const { scanDate, nextSessionDate, candidates } = params;

    const mybCandidates = candidates.filter(c => c.module === 'MULTI_YEAR');
    const patCandidates = candidates.filter(c => c.module === 'PATTERN');
    const momCandidates = candidates.filter(c => c.module === 'MOMENTUM');

    const header =
      `👁️ <b>CPR PRO — MARKET TOOLS WATCHLIST</b>\n` +
      `📅 Scan Date: <b>${escapeTelegramHtml(scanDate)}</b> | Next Session: <b>${escapeTelegramHtml(nextSessionDate)}</b>\n` +
      `⏱️ <i>Source: Completed EOD Bhavcopy (Daily)</i>\n\n`;

    if (candidates.length === 0) {
      return (
        header +
        `<i>No qualifying candidates found across Multi-Year Breakout, 52W Patterns, or Momentum Leaders today.\n` +
        `Precompute completed successfully.</i>`
      );
    }

    const formatCandidate = (c: WatchCandidate) => {
      const sym = escapeTelegramHtml(c.symbol);
      const sec = escapeTelegramHtml(c.sector);
      const close = c.previousClose.toFixed(2);
      const detail = escapeTelegramHtml(c.setupDetail);
      const ctx = escapeTelegramHtml(c.context);
      const crossTag = c.crossModuleTags && c.crossModuleTags.length > 0
        ? `\n   🔗 Also: <i>${escapeTelegramHtml(c.crossModuleTags.join(', '))}</i>`
        : '';

      if (c.module === 'MOMENTUM') {
        return (
          `• <b>${sym}</b> (${sec})\n` +
          `   Setup: <b>${detail}</b>\n` +
          `   Reference: <b>₹${close}</b> (Previous Close)\n` +
          `   Status: <i>Candidate selection only — no entry trigger established</i>\n` +
          `   Context: ${ctx}${crossTag}\n\n`
        );
      }

      if (c.module === 'PATTERN') {
        const refHigh = (c.structuralPivot ?? c.previousClose).toFixed(2);
        return (
          `• <b>${sym}</b> (${sec})\n` +
          `   Setup: <b>${detail}</b>\n` +
          `   Reference: <b>₹${refHigh}</b> (52W High) | Close: ₹${close}\n` +
          `   Status: <i>Pattern candidate — structural pattern pivot pending confirmation</i>\n` +
          `   Context: ${ctx}${crossTag}\n\n`
        );
      }

      const pivotLabel = escapeTelegramHtml(c.structuralPivotLabel ?? 'Pivot');
      const pivot = (c.structuralPivot ?? c.previousClose).toFixed(2);
      return (
        `• <b>${sym}</b> (${sec})\n` +
        `   Setup: <b>${detail}</b>\n` +
        `   Pivot: <b>₹${pivot}</b> (${pivotLabel}) | Close: ₹${close}\n` +
        `   Context: ${ctx}${crossTag}\n\n`
      );
    };

    let body = '';

    // Multi-Year Section
    body += `🚀 <b>MULTI-YEAR BREAKOUTS (${mybCandidates.length})</b>\n`;
    if (mybCandidates.length > 0) {
      for (const c of mybCandidates) body += formatCandidate(c);
    } else {
      body += `<i>None qualified today</i>\n\n`;
    }

    // 52W Patterns Section
    body += `🏆 <b>52W PATTERNS (${patCandidates.length})</b>\n`;
    if (patCandidates.length > 0) {
      for (const c of patCandidates) body += formatCandidate(c);
    } else {
      body += `<i>None qualified today</i>\n\n`;
    }

    // Momentum Leaders Section
    body += `⚡ <b>MOMENTUM LEADERS (${momCandidates.length})</b>\n`;
    if (momCandidates.length > 0) {
      for (const c of momCandidates) body += formatCandidate(c);
    } else {
      body += `<i>None qualified today</i>\n\n`;
    }

    const footer =
      `⚠️ <b>WATCH ONLY</b> — <i>Not an entry recommendation. Valid for session ${escapeTelegramHtml(nextSessionDate)}.\n` +
      `Breakout candidates require next-session price hold above structural pivot; momentum candidates require intraday setup confirmation.</i>`;

    return (header + body + footer).trim();
  }

  /**
   * Dispatches the WATCH notification via TelegramService for a specific date (or defaults to today IST).
   * Convenience wrapper / entrypoint used by scheduler jobs and integration tests.
   */
  static async runWatch(
    date?: string | null
  ): Promise<DispatchWatchAlertsResult> {
    return this.dispatchWatchAlerts(date ? { forceDate: date } : undefined);
  }

  /**
   * Dispatches the WATCH notification via TelegramService.
   * Supports dry-run mode and structured logs.
   */
  static async dispatchWatchAlerts(
    options?: DispatchWatchAlertsOptions
  ): Promise<DispatchWatchAlertsResult> {
    const report = await this.assembleWatchReport({
      targetDate: options?.forceDate,
      maxCandidates: options?.maxCandidates,
    });

    const reportId = `market-tools-watch:${report.scanDate ?? 'unknown'}:${report.nextSessionDate ?? 'unknown'}`;

    if (!report.ready || !report.message) {
      return {
        success: false,
        sent: false,
        deliveryStatus: 'not_sent',
        reportId,
        reason: report.reason ?? 'not_ready',
        scanDate: report.scanDate,
        nextSessionDate: report.nextSessionDate,
      };
    }

    if (options?.dryRun) {
      console.log(
        `[MarketToolsWatchService] Dry-run execution for scanDate=${report.scanDate}, candidates=${report.candidateCount}, reportId=${reportId}`
      );
      return {
        success: true,
        sent: false,
        dryRun: true,
        deliveryStatus: 'not_sent',
        reportId,
        scanDate: report.scanDate,
        nextSessionDate: report.nextSessionDate,
        candidateCount: report.candidateCount,
        message: report.message,
      };
    }

    console.log(
      `[MarketToolsWatchService] Dispatching WATCH alert to Telegram for scanDate=${report.scanDate} (${report.candidateCount} candidates, reportId=${reportId})...`
    );

    const telegramRes = await TelegramService.sendRawMessage(report.message);

    if (!telegramRes.ok) {
      const isUncertain =
        typeof telegramRes.reason === 'string' &&
        (/fetch_error|timeout|aborted|network|econnreset|etimedout/i.test(telegramRes.reason) ||
         telegramRes.reason === 'max_retries_exceeded');

      if (isUncertain) {
        console.warn(
          `[MarketToolsWatchService] Delivery status uncertain (delivery_unknown) for scanDate=${report.scanDate}, nextSession=${report.nextSessionDate}, reportId=${reportId}: ` +
          `Telegram request timed out or network connection broke after dispatch (${telegramRes.reason}). Automatic retry suppressed to avoid duplicate delivery.`
        );
        return {
          success: false,
          sent: false,
          deliveryStatus: 'delivery_unknown',
          reportId,
          reason: telegramRes.reason,
          scanDate: report.scanDate,
          nextSessionDate: report.nextSessionDate,
          candidateCount: report.candidateCount,
        };
      }

      console.error(
        `[MarketToolsWatchService] Telegram delivery failed for scanDate=${report.scanDate}, reportId=${reportId}:`,
        telegramRes.reason
      );
      return {
        success: false,
        sent: false,
        deliveryStatus: 'failed',
        reportId,
        reason: telegramRes.reason,
        scanDate: report.scanDate,
        nextSessionDate: report.nextSessionDate,
        candidateCount: report.candidateCount,
      };
    }

    console.log(
      `[MarketToolsWatchService] Successfully dispatched WATCH alert for scanDate=${report.scanDate}, reportId=${reportId}`
    );

    return {
      success: true,
      sent: true,
      deliveryStatus: 'delivered',
      reportId,
      scanDate: report.scanDate,
      nextSessionDate: report.nextSessionDate,
      candidateCount: report.candidateCount,
      message: report.message,
    };
  }
}
