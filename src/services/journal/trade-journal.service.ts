import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { TradeJournal } from '@prisma/client';
import { getISTTime } from '@/lib/market-hours';
import { computeOptionPnl } from '@/lib/pnl';
import { sanitizePagination } from '@/lib/pagination';
import { OptionSuggestionService } from '@/services/option-suggestion.service';


export class TradeJournalService {

  /**
   * Called at signal time (3:15–3:25 PM) by BTST/CPR crons.
   * Fetches live option CMP via OptionChainService and persists entry.
   * Silently skips if duplicate (same symbol + date + signalType).
   */
  static async logSignal(params: {
    signalType: 'CPR' | 'BTST' | 'STBT';
    symbol: string;
    optionContract: string; // e.g. '1920 CE'
    optionStrike: number;
    optionType: 'CE' | 'PE';
    score: number;
    confidence: number;
    signalSummary: string;
    /** Exact OvernightSignal selected by discover/journal — required for BTST/STBT metadata. */
    overnightSignalId?: string;
    // Shadow Mode: BTST v2 parallel scoring
    scoreV2?: number;
    v2Breakdown?: Record<string, unknown>;
  }): Promise<boolean> {
    try {
      // Link the exact selected OvernightSignal (never "newest by createdAt").
      // CPR and callers without an id intentionally skip overnight metadata.
      const overnightSignal = params.overnightSignalId
        ? await prisma.overnightSignal.findUnique({
            where: { id: params.overnightSignalId },
          })
        : null;

      const entryCmp = await TradeJournalService.fetchOptionCmp(
        params.symbol,
        params.optionStrike,
        params.optionType
      );

      if (!entryCmp || entryCmp <= 0) {
        console.warn(
          `[TradeJournal] Could not fetch entry CMP for ` +
          `${params.symbol} ${params.optionContract}`
        );
        return false;
      }

      // Midnight IST for the signal date (deduplication key)
      const tradeDate = TradeJournalService.todayMidnightIST();

      // Upsert — update:{} means "do nothing" if already exists today
      await prisma.tradeJournal.upsert({
        where: {
          symbol_tradeDate_signalType: {
            symbol: params.symbol,
            tradeDate,
            signalType: params.signalType,
          },
        },
        update: {
          // V1 entry/option data never overwritten — only v2 shadow fields update
          ...(params.scoreV2 !== undefined ? { scoreV2: params.scoreV2 } : {}),
          ...(params.v2Breakdown !== undefined
            ? { v2Breakdown: params.v2Breakdown as Prisma.InputJsonValue }
            : {}),
        },
        create: {
          tradeDate,
          signalType: params.signalType,
          symbol: params.symbol,
          optionContract: params.optionContract,
          optionStrike: params.optionStrike,
          optionType: params.optionType,
          entryCmp,
          entryTime: new Date(),
          score: params.score,
          confidence: params.confidence,
          signalSummary: params.signalSummary,
          // Shadow Mode: persist v2 scoring in parallel
          scoreV2: params.scoreV2 ?? null,
          v2Breakdown: params.v2Breakdown !== undefined
            ? params.v2Breakdown as Prisma.InputJsonValue
            : Prisma.JsonNull,
          
          // Phase 3 Snapshots
          overnightSignalId: overnightSignal?.id ?? null,
          modelEntryPrice: overnightSignal?.entry ?? null,
          modelExitPrice: overnightSignal?.target ?? null,
          qualityBucketAtSignal: overnightSignal?.qualityBucket ?? null,
          eventRiskReasonAtSignal: overnightSignal?.eventRiskReason ?? null,
          eventRiskScoreAtSignal: overnightSignal?.eventRisk ?? null,
          slippageModelVersionAtSignal: overnightSignal?.slippageModelVersion ?? null,
          regimeSnapshotAtSignal: overnightSignal?.regimeSnapshot ?? null,
          qualityModelVersionAtSignal: overnightSignal?.qualityModelVersion ?? null,
        },
      });

      console.log(
        `[TradeJournal] Logged ${params.signalType}: ` +
        `${params.symbol} ${params.optionContract} @ ₹${entryCmp}`
      );
      return true;
    } catch (err) {
      console.error('[TradeJournal] Failed to log signal:', err);
      return false;
    }
  }

  /**
   * Fetch live option LTP by building the Fyers symbol string using
   * OptionSuggestionService.buildSuggestion() (or extracting from it),
   * then looking it up in the cached option chain data.
   */
  static async fetchOptionCmp(
    symbol: string,
    strike: number,
    optionType: 'CE' | 'PE',
    entryDbId?: string,
    tradeExpiryStr?: string
  ): Promise<number | null> {
    try {
      const { OptionChainService } = await import('@/services/option-chain.service');
      const cleanSym = symbol.toUpperCase().trim().replace('-EQ', '');
      const chainRes = await OptionChainService.getOptionChain(cleanSym, false);
      if ('error' in chainRes) {
        throw new Error(`Failed to fetch option chain: ${chainRes.error}`);
      }
      
      let option = chainRes.optionsChain.find(
        o => o.strikePrice === strike && o.optionType === optionType
      );
      let wasAdjusted = false;

      if (!option) {
        // Fallback: Find closest strike of same type (handles corporate action adjustments like 2340 -> 2338)
        const sameTypeOptions = chainRes.optionsChain.filter(
          o => o.optionType === optionType && o.strikePrice > 0
        );
        if (sameTypeOptions.length > 0) {
          sameTypeOptions.sort((a, b) => Math.abs(a.strikePrice - strike) - Math.abs(b.strikePrice - strike));
          const closest = sameTypeOptions[0];
          const maxDiff = strike * 0.05; // reasonable threshold (within 5% of target strike)
          if (Math.abs(closest.strikePrice - strike) <= maxDiff) {
            console.log(
              `[TradeJournal] Exact strike ${strike} not found for ${symbol} ${optionType}. ` +
              `Using closest adjusted strike ${closest.strikePrice} (symbol: ${closest.symbol})`
            );
            option = closest;
            wasAdjusted = true;
          }
        }
      }

      if (!option) {
        throw new Error(`Option not found in chain for strike ${strike} and type ${optionType}`);
      }

      const expiryStr = OptionSuggestionService.extractFyersOptionExpiry(
        option.symbol,
        cleanSym,
        option.strikePrice,
        optionType
      );

      if (tradeExpiryStr && expiryStr && tradeExpiryStr !== expiryStr) {
        console.error(`[TradeJournal] Expiry mismatch! Trade recorded as ${tradeExpiryStr}, but chain returned ${expiryStr} for ${symbol} ${strike} ${optionType}`);
        return null;
      }

      if (wasAdjusted && entryDbId) {
        try {
          const finalFormattedName = expiryStr 
            ? `${expiryStr} ${option.strikePrice} ${optionType}` 
            : `${option.strikePrice} ${optionType}`;

          await prisma.tradeJournal.update({
            where: { id: entryDbId },
            data: {
              optionStrike: option.strikePrice,
              optionContract: finalFormattedName,
            },
          });
          console.log(`[TradeJournal] Updated DB record ${entryDbId} with adjusted strike ${option.strikePrice} and contract name ${finalFormattedName}`);
        } catch (dbErr) {
          console.warn(`[TradeJournal] Failed to update DB record ${entryDbId} with adjusted strike:`, dbErr);
        }
      }

      return option.ltp > 0 ? option.ltp : null;
    } catch (err) {
      console.error(
        `[TradeJournal] fetchOptionCmp failed for ` +
        `${symbol} ${strike}${optionType}:`, err
      );
      return null;
    }
  }

  /**
   * Called by snapshot cron at 9:16, 9:30, 9:45 AM IST (Day D+1).
   * Uses previousTradingDayMidnightIST() because signals are logged on Day D at 3:15 PM,
   * and snapshots fire the next morning — both must resolve to the same IST date key.
   * At 9:45 AM auto-closes entries that have no manual exit yet.
   */
  static async captureSnapshot(timeSlot: '916' | '930' | '945', forDate?: Date): Promise<void> {
    try {
      // Snapshots run on D+1 — query entries logged on D, the previous TRADING day (not
      // just "yesterday" — see previousTradingDayMidnightIST() for why that distinction matters)
      const signalDate = forDate || TradeJournalService.previousTradingDayMidnightIST();

      const fieldMap = {
        '916':  'cmp916',
        '930':  'cmp930',
        '945':  'cmp945',
      } as const;

      const field = fieldMap[timeSlot];

      // Only fetch entries missing this snapshot
      const entries = await prisma.tradeJournal.findMany({
        where: {
          tradeDate: signalDate,
          [field]: null,
        },
      });

      if (entries.length === 0) {
        console.log(`[TradeJournal] No entries need ${timeSlot} snapshot`);
        return;
      }

      for (const entry of entries) {
        const firstToken = entry.optionContract ? entry.optionContract.split(' ')[0] : undefined;
        const tradeExpiry = (firstToken && firstToken !== String(entry.optionStrike)) ? firstToken : undefined;

        const cmp = await TradeJournalService.fetchOptionCmp(
          entry.symbol,
          entry.optionStrike,
          entry.optionType as 'CE' | 'PE',
          entry.id,
          tradeExpiry
        );

        if (!cmp) {
          console.warn(
            `[TradeJournal] ${timeSlot} snapshot: no CMP for ` +
            `${entry.symbol} ${entry.optionContract}`
          );
          continue;
        }

        // Write the snapshot column only if it is STILL null in the DB. Using updateMany
        // with the null guard (instead of a plain update on a stale in-memory row) makes
        // the write idempotent and race-safe: a duplicate/overlapping cron run cannot
        // overwrite a slot another run already filled.
        const snapshotWrite = await prisma.tradeJournal.updateMany({
          where: { id: entry.id, [field]: null },
          data: { [field]: cmp },
        });

        if (snapshotWrite.count === 0) {
          console.log(
            `[TradeJournal] ${timeSlot} snapshot already filled for ` +
            `${entry.symbol} ${entry.optionContract}; skipping.`
          );
          continue;
        }

        // 9:45 AM auto-close: set exit ONLY if no exit exists yet in the DB. The
        // `exitCmp: null` guard in updateMany is critical — between the findMany above
        // and this write a user may have PATCHed a real manual exit; without the guard
        // the auto-close would silently clobber their true exit price and P&L.
        let autoClosed = false;
        if (timeSlot === '945') {
          const { pnl, pnlPct } = computeOptionPnl(entry.entryCmp, cmp);
          const closeWrite = await prisma.tradeJournal.updateMany({
            where: { id: entry.id, exitCmp: null },
            data: {
              exitCmp: cmp,
              exitTime: new Date(),
              pnl,
              pnlPct,
            },
          });
          autoClosed = closeWrite.count > 0;
        }

        console.log(
          `[TradeJournal] ${timeSlot} snapshot: ` +
          `${entry.symbol} ${entry.optionContract} @ ₹${cmp}`
        );

        if (autoClosed) {
           await TradeJournalService.classifyExecutionOutcome(entry.id);
        }
      }
    } catch (err) {
      console.error(`[TradeJournal] Snapshot ${timeSlot} failed:`, err);
    }
  }

  /**
   * Fetch paginated journal entries with summary stats.
   * Used by the API route (Step E).
   */
  static async getEntries(params: {
    fromDate?: string;
    toDate?: string;
    signalType?: string;
    qualityBucket?: string;
    executionOutcome?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      fromDate,
      toDate,
      signalType,
      qualityBucket,
      executionOutcome,
    } = params;

    // Defensive: never trust raw page/limit — a negative skip throws in Prisma and an
    // unbounded take can OOM the stats query that loads every matching row.
    const { page, limit } = sanitizePagination(params.page, params.limit);

    const where: Record<string, unknown> = {};

    if (fromDate || toDate) {
      where.tradeDate = {
        ...(fromDate ? { gte: TradeJournalService.istDateStringToMidnightUTC(fromDate) } : {}),
        ...(toDate ? {
          lt: (() => {
            const next = TradeJournalService.istDateStringToMidnightUTC(toDate);
            next.setUTCDate(next.getUTCDate() + 1);
            return next;
          })(),
        } : {}),
      };
    }

    if (signalType && signalType !== 'ALL') {
      where.signalType = signalType;
    }

    if (qualityBucket && qualityBucket !== 'ALL') {
      where.qualityBucketAtSignal = qualityBucket;
    }

    if (executionOutcome && executionOutcome !== 'ALL') {
      where.executionOutcome = executionOutcome;
    }

    const [entries, total, allEntries] = await Promise.all([
      prisma.tradeJournal.findMany({
        where,
        orderBy: [{ tradeDate: 'desc' }, { signalType: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tradeJournal.count({ where }),
      // Summary stats computed over all matching entries (not just current page)
      prisma.tradeJournal.findMany({ where }),
    ]);

    const closed  = allEntries.filter((e: TradeJournal) => e.pnl !== null);
    // Strictly positive PnL = winner; breakeven (pnl === 0) is not a win
    const winners = closed.filter((e: TradeJournal) => (e.pnl ?? 0) > 0);

    const byType = {
      CPR:  closed.filter((e: TradeJournal) => e.signalType === 'CPR'),
      BTST: closed.filter((e: TradeJournal) => e.signalType === 'BTST'),
      STBT: closed.filter((e: TradeJournal) => e.signalType === 'STBT'),
    };

    const winRateByType = (arr: typeof closed): number =>
      arr.length > 0
        ? parseFloat(
            (arr.filter((e: TradeJournal) => (e.pnl ?? 0) > 0).length / arr.length * 100)
              .toFixed(1)
          )
        : 0;

    // Minimum 5 trades required before crowning a bestSignalType
    const MIN_SAMPLE = 5;
    const bestType = (['CPR', 'BTST', 'STBT'] as const).reduce(
      (best, t) => {
        if (byType[t].length < MIN_SAMPLE) return best;
        const wr = winRateByType(byType[t]);
        return wr > best.winRate ? { type: t as 'CPR' | 'BTST' | 'STBT' | null, winRate: wr } : best;
      },
      { type: null as 'CPR' | 'BTST' | 'STBT' | null, winRate: 0 }
    );

    return {
      entries,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalTrades:    closed.length,
        totalClosedTrades: closed.length,
        totalAllTrades: total,
        winners:        winners.length,
        winRate:        closed.length > 0
          ? parseFloat((winners.length / closed.length * 100).toFixed(1))
          : 0,
        avgPnlPct: closed.length > 0
          ? parseFloat(
              (closed.reduce((s: number, e: TradeJournal) => s + (e.pnlPct ?? 0), 0) / closed.length)
                .toFixed(2)
            )
          : 0,
        bestSignalType: bestType.type,
        byType: {
          CPR:  { count: byType.CPR.length,  winRate: winRateByType(byType.CPR)  },
          BTST: { count: byType.BTST.length, winRate: winRateByType(byType.BTST) },
          STBT: { count: byType.STBT.length, winRate: winRateByType(byType.STBT) },
        },
      },
    };
  }

  /**
   * Returns the UTC timestamp corresponding to midnight IST for TODAY.
   * Used by logSignal() — signals fire at 3:15-3:25 PM IST (same IST day).
   *
   * Example: Jun 25 IST day → Jun 24 18:30 UTC
   * (IST = UTC+5:30, so IST midnight = UTC -5h30m from calendar midnight)
   */
  static todayMidnightIST(): Date {
    const now = new Date();
    const istStr = now.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    }); // → "2026-06-25"
    const [y, m, d] = istStr.split('-').map(Number);
    // midnight UTC of that calendar date
    const midnightUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    // subtract 5h30m to get IST midnight in UTC
    midnightUTC.setUTCMinutes(midnightUTC.getUTCMinutes() - 330);
    return midnightUTC;
  }

  /**
   * Returns the UTC timestamp corresponding to midnight IST for the PREVIOUS TRADING DAY
   * (not just "yesterday"). Used by captureSnapshot() — snapshots fire at 9:16–10:00 AM IST
   * on Day D+1, and must query entries logged on Day D, the previous *trading* day, which is
   * NOT always 24 hours back (weekends, NSE holidays).
   *
   * BUG THIS REPLACES: the old flat "now - 24h" version resolved Monday's "yesterday" to
   * Sunday instead of Friday, so any signal logged the Friday before a weekend was silently
   * orphaned — its snapshot columns stayed null forever with no retry. Same failure mode after
   * any single NSE holiday. Walking backwards through getISTTime().isTradingDay fixes both.
   *
   * Example: snapshots on Mon Jun 29 morning → previous trading day is Fri Jun 26,
   * not Sun Jun 28 → query Jun 26 IST = Jun 25 18:30 UTC
   */
  private static previousTradingDayMidnightIST(now: Date = new Date()): Date {
    let candidate = new Date(now.getTime());
    for (let i = 1; i <= 10; i++) {
      candidate = new Date(candidate.getTime() - 24 * 60 * 60 * 1000);
      const { isTradingDay, dateString } = getISTTime(candidate);
      if (isTradingDay) {
        const [y, m, d] = dateString.split('-').map(Number);
        const midnightUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        midnightUTC.setUTCMinutes(midnightUTC.getUTCMinutes() - 330);
        return midnightUTC;
      }
    }
    // Should be unreachable in practice (would need 10 consecutive non-trading days) —
    // fail loudly instead of silently returning a wrong date.
    throw new Error(
      '[TradeJournal] previousTradingDayMidnightIST: no trading day found within 10 days. ' +
      'Check NSE_HOLIDAYS_BY_YEAR in market-hours.ts is populated for the current year.'
    );
  }

  private static istDateStringToMidnightUTC(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    const midnightUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    midnightUTC.setUTCMinutes(midnightUTC.getUTCMinutes() - 330);
    return midnightUTC;
  }

  static todayISTString(): string {
    return new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    });
  }

  static async classifyExecutionOutcome(tradeId: string): Promise<void> {
    try {
      const trade = await prisma.tradeJournal.findUnique({ where: { id: tradeId } });
      if (!trade || trade.exitCmp === null || trade.entryCmp === null) return;
  
      let outcome = 'MODEL_VALID'; // Default assumed good
      const pnlPct = trade.pnlPct ?? 0;
  
      // Adverse Gap checks (Comparing 9:16 vs entry)
      if (trade.signalType !== 'CPR' && trade.cmp916) {
        const gapPct = ((trade.cmp916 - trade.entryCmp) / trade.entryCmp) * 100;
        // Severe adverse gap blow-through in options is usually -15% or worse overnight
        if (gapPct < -15) {
          outcome = 'GAP_FAILURE';
        }
      }
  
      if (pnlPct < 0 && outcome !== 'GAP_FAILURE') {
        if (trade.qualityBucketAtSignal === 'LOW_QUALITY') {
          outcome = 'LOW_QUALITY_SHOULD_SKIP';
        } else if (trade.eventRiskScoreAtSignal && trade.eventRiskScoreAtSignal >= 50) {
          outcome = 'EVENT_RISK_AVOIDABLE';
        } else if (trade.qualityBucketAtSignal === 'WATCHLIST') {
           outcome = 'MODEL_WEAK';
        } else {
           outcome = 'EXECUTION_SLIPPAGE'; // It was TRADEABLE but lost
        }
      }
  
      await prisma.tradeJournal.update({
        where: { id: tradeId },
        data: { executionOutcome: outcome },
      });
    } catch (e) {
      console.error(`[TradeJournal] Failed to classify execution outcome for ${tradeId}`, e);
    }
  }
}
