import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { OptionChainService } from '@/services/option-chain.service';

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
    // Shadow Mode: BTST v2 parallel scoring
    scoreV2?: number;
    v2Breakdown?: Record<string, unknown>;
  }): Promise<void> {
    try {
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
        return;
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
        },
      });

      console.log(
        `[TradeJournal] Logged ${params.signalType}: ` +
        `${params.symbol} ${params.optionContract} @ ₹${entryCmp}`
      );
    } catch (err) {
      console.error('[TradeJournal] Failed to log signal:', err);
    }
  }

  /**
   * Fetch live option LTP by building the Fyers symbol string using
   * OptionChainService.buildOptionSymbol() (format: NSE:SYMBOL26JUNSTRIKEPE/CE),
   * then looking it up in the cached option chain data.
   */
  static async fetchOptionCmp(
    symbol: string,
    strike: number,
    optionType: 'CE' | 'PE'
  ): Promise<number | null> {
    try {
      const { OptionChainService } = await import('@/services/option-chain.service');
      const cleanSym = symbol.toUpperCase().trim().replace('-EQ', '');
      const chainRes = await OptionChainService.getOptionChain(cleanSym);
      if ('error' in chainRes) {
        throw new Error(`Failed to fetch option chain: ${chainRes.error}`);
      }
      const option = chainRes.optionsChain.find(
        o => o.strikePrice === strike && o.optionType === optionType
      );
      if (!option) {
        throw new Error(`Option not found in chain for strike ${strike} and type ${optionType}`);
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
   * Called by snapshot cron at 9:16, 9:30, 9:45, 10:00 AM IST (Day D+1).
   * Uses yesterdayMidnightIST() because signals are logged on Day D at 3:15 PM,
   * and snapshots fire the next morning — both must resolve to the same IST date key.
   * At 10:00 AM auto-closes entries that have no manual exit yet.
   */
  static async captureSnapshot(
    timeSlot: '916' | '930' | '945' | '1000'
  ): Promise<void> {
    try {
      // Snapshots run on D+1 — query entries logged on D (yesterday IST)
      const signalDate = TradeJournalService.yesterdayMidnightIST();

      const fieldMap = {
        '916':  'cmp916',
        '930':  'cmp930',
        '945':  'cmp945',
        '1000': 'cmp1000',
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
        const cmp = await TradeJournalService.fetchOptionCmp(
          entry.symbol,
          entry.optionStrike,
          entry.optionType as 'CE' | 'PE'
        );

        if (!cmp) {
          console.warn(
            `[TradeJournal] ${timeSlot} snapshot: no CMP for ` +
            `${entry.symbol} ${entry.optionContract}`
          );
          continue;
        }

        const updateData: Record<string, unknown> = { [field]: cmp };

        // 10:00 AM auto-close: set exit only if no manual exit yet
        if (timeSlot === '1000' && !entry.exitCmp) {
          updateData.exitCmp  = cmp;
          updateData.exitTime = new Date();
          updateData.pnl      = cmp - entry.entryCmp;
          updateData.pnlPct   =
            ((cmp - entry.entryCmp) / entry.entryCmp) * 100;
        }

        await prisma.tradeJournal.update({
          where: { id: entry.id },
          data: updateData,
        });

        console.log(
          `[TradeJournal] ${timeSlot} snapshot: ` +
          `${entry.symbol} ${entry.optionContract} @ ₹${cmp}`
        );
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
    page?: number;
    limit?: number;
  }) {
    const { fromDate, toDate, signalType, page = 1, limit = 50 } = params;

    const where: Record<string, unknown> = {};

    if (fromDate || toDate) {
      where.tradeDate = {
        ...(fromDate ? { gte: new Date(fromDate) } : {}),
        ...(toDate   ? { lte: new Date(toDate)   } : {}),
      };
    }

    if (signalType && signalType !== 'ALL') {
      where.signalType = signalType;
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

    const closed  = allEntries.filter(e => e.pnl !== null);
    // Strictly positive PnL = winner; breakeven (pnl === 0) is not a win
    const winners = closed.filter(e => (e.pnl ?? 0) > 0);

    const byType = {
      CPR:  closed.filter(e => e.signalType === 'CPR'),
      BTST: closed.filter(e => e.signalType === 'BTST'),
      STBT: closed.filter(e => e.signalType === 'STBT'),
    };

    const winRateByType = (arr: typeof closed): number =>
      arr.length > 0
        ? parseFloat(
            (arr.filter(e => (e.pnl ?? 0) > 0).length / arr.length * 100)
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
        winners:        winners.length,
        winRate:        closed.length > 0
          ? parseFloat((winners.length / closed.length * 100).toFixed(1))
          : 0,
        avgPnlPct: closed.length > 0
          ? parseFloat(
              (closed.reduce((s, e) => s + (e.pnlPct ?? 0), 0) / closed.length)
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
   * Returns the UTC timestamp corresponding to midnight IST for YESTERDAY.
   * Used by captureSnapshot() — snapshots fire at 9:16–10:00 AM IST on Day D+1,
   * but must query entries logged on Day D (the previous IST calendar day).
   *
   * Example: snapshots on Jun 26 morning → query Jun 25 IST = Jun 24 18:30 UTC
   */
  private static yesterdayMidnightIST(): Date {
    const now = new Date();
    // Shift back 24 hours before computing IST date string
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const istStr = yesterday.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    }); // → "2026-06-24"
    const [y, m, d] = istStr.split('-').map(Number);
    const midnightUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    midnightUTC.setUTCMinutes(midnightUTC.getUTCMinutes() - 330);
    return midnightUTC;
  }
}
