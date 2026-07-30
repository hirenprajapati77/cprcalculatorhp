import { prisma } from '@/lib/db';
import { getISTDateString } from '@/lib/market-hours';
import { computeWinRate } from '@/lib/win-rate';
import { parseStockBtstTradeContext } from '../backtest/stock-btst-slice-metrics';

export interface StockBtstCompareRow {
  symbol: string;
  signalDate: string;
  live: {
    id: string;
    score: number;
    classification: string | null;
    direction: string | null;
    optionContract: string;
    entryCmp: number;
    exitCmp: number | null;
    pnlPct: number | null;
    regime: string | null;
    matched: boolean;
  } | null;
  backtest: {
    id: string;
    score: number;
    classification: string | null;
    direction: string | null;
    spotPnlPct: number | null;
    status: string;
    exitReason: string | null;
    vduBand: string | null;
    regimeTrend: string | null;
    matched: boolean;
  } | null;
  alignment: 'BOTH' | 'LIVE_ONLY' | 'BACKTEST_ONLY';
}

export interface StockBtstCompareResult {
  backtestRunId: string | null;
  backtestRunName: string | null;
  backtestWindow: { start: string; end: string } | null;
  rows: StockBtstCompareRow[];
  summary: {
    matchedDays: number;
    liveOnly: number;
    backtestOnly: number;
    liveClosed: number;
    liveWinRate: number | null;
    backtestWinRate: number | null;
  };
}

function journalDateKey(tradeDate: Date): string {
  return getISTDateString(tradeDate);
}

function backtestDateKey(entryDate: Date): string {
  return getISTDateString(entryDate);
}

function parseClassification(signalSummary: string): string | null {
  const first = signalSummary.split(',')[0]?.trim();
  return first || null;
}

function parseDirection(signalSummary: string): string | null {
  const parts = signalSummary.split(',').map((p) => p.trim());
  const dir = parts.find((p) => p === 'LONG' || p === 'SHORT');
  return dir ?? null;
}

function parseRegimeFromSummary(signalSummary: string): string | null {
  const part = signalSummary.split(',').find((p) => p.trim().startsWith('REGIME_'));
  return part ? part.trim().replace('REGIME_', '') : null;
}

function isStockBtstJournalEntry(signalSummary: string): boolean {
  return !signalSummary.includes('INDEX');
}

function normalizeSymbolForJoin(symbol: string): string {
  let sym = symbol.toUpperCase().trim();
  if (sym.endsWith('.NS')) sym = sym.slice(0, -3);
  if (sym.endsWith('.BO')) sym = sym.slice(0, -3);
  return sym;
}

async function resolveBacktestRun(backtestRunId?: string) {
  if (backtestRunId) {
    return prisma.backtestRun.findUnique({ where: { id: backtestRunId } });
  }
  return prisma.backtestRun.findFirst({
    where: { strategyMode: 'BTST_STBT_DRIVEN', status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getStockBtstCompare(
  backtestRunId?: string
): Promise<StockBtstCompareResult> {
  const run = await resolveBacktestRun(backtestRunId);

  const liveEntries = await prisma.tradeJournal.findMany({
    where: {
      signalType: 'BTST',
      NOT: { signalSummary: { contains: 'INDEX' } },
    },
    orderBy: { tradeDate: 'desc' },
    take: 300,
  });

  const backtestTrades = run
    ? await prisma.trade.findMany({
        where: {
          backtestRunId: run.id,
          strategyMode: 'BTST_STBT_DRIVEN',
        },
        orderBy: { entryDate: 'asc' },
      })
    : [];

  // Safe to key live rows by symbol + date: TradeJournal enforces
  // @@unique([symbol, tradeDate, signalType]), so there can be at most one
  // BTST journal entry per stock/day.
  const liveByKey = new Map<string, (typeof liveEntries)[number]>();
  for (const e of liveEntries) {
    if (!isStockBtstJournalEntry(e.signalSummary)) continue;
    const normSym = normalizeSymbolForJoin(e.symbol);
    liveByKey.set(`${normSym}_${journalDateKey(e.tradeDate)}`, e);
  }

  const btByKey = new Map<string, (typeof backtestTrades)[number]>();
  for (const t of backtestTrades) {
    const normSym = normalizeSymbolForJoin(t.symbol);
    btByKey.set(`${normSym}_${backtestDateKey(t.entryDate)}`, t);
  }

  const allKeys = new Set([...liveByKey.keys(), ...btByKey.keys()]);
  const rows: StockBtstCompareRow[] = [];

  for (const key of [...allKeys].sort().reverse()) {
    const sep = key.indexOf('_');
    const symbol = key.slice(0, sep);
    const signalDate = key.slice(sep + 1);
    const live = liveByKey.get(key) ?? null;
    const bt = btByKey.get(key) ?? null;

    let alignment: StockBtstCompareRow['alignment'];
    if (live && bt) alignment = 'BOTH';
    else if (live) alignment = 'LIVE_ONLY';
    else alignment = 'BACKTEST_ONLY';

    const ctx = bt ? parseStockBtstTradeContext(bt.signalsJson) : {};

    rows.push({
      symbol,
      signalDate,
      live: live
        ? {
            id: live.id,
            score: live.score,
            classification: parseClassification(live.signalSummary),
            direction: parseDirection(live.signalSummary),
            optionContract: live.optionContract,
            entryCmp: live.entryCmp,
            exitCmp: live.exitCmp,
            pnlPct: live.pnlPct,
            regime:
              live.regimeSnapshotAtSignal ??
              parseRegimeFromSummary(live.signalSummary),
            matched: !!bt,
          }
        : null,
      backtest: bt
        ? {
            id: bt.id,
            score: bt.score ?? 0,
            classification: ctx.classification ?? null,
            direction: ctx.direction ?? bt.type ?? null,
            spotPnlPct: bt.pnlPercent,
            status: bt.status,
            exitReason: bt.exitReason,
            vduBand: ctx.vduBand ?? null,
            regimeTrend: ctx.regimeTrend ?? null,
            matched: !!live,
          }
        : null,
      alignment,
    });
  }

  const liveClosed = liveEntries.filter(
    (e) => isStockBtstJournalEntry(e.signalSummary) && e.exitCmp != null
  );
  const liveWinRateSummary = computeWinRate(liveClosed, (entry) => entry.pnlPct ?? 0);
  const btClosed = backtestTrades.filter(
    (t) => t.status !== 'OPEN' && t.status !== 'NEVER_TRIGGERED'
  );
  const backtestWinRateSummary = computeWinRate(
    btClosed,
    (trade) => trade.pnl ?? trade.pnlPercent ?? 0
  );

  return {
    backtestRunId: run?.id ?? null,
    backtestRunName: run?.name ?? null,
    backtestWindow: run
      ? {
          start: getISTDateString(run.startDate),
          end: getISTDateString(run.endDate),
        }
      : null,
    rows,
    summary: {
      matchedDays: rows.filter((r) => r.alignment === 'BOTH').length,
      liveOnly: rows.filter((r) => r.alignment === 'LIVE_ONLY').length,
      backtestOnly: rows.filter((r) => r.alignment === 'BACKTEST_ONLY').length,
      liveClosed: liveClosed.length,
      liveWinRate:
        liveWinRateSummary.decisive > 0 ? liveWinRateSummary.winRate : null,
      backtestWinRate:
        backtestWinRateSummary.decisive > 0 ? backtestWinRateSummary.winRate : null,
    },
  };
}
