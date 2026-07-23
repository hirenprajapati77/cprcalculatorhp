'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

export default function IndexBtstComparePanel() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['indexBtstCompare'],
    queryFn: async () => {
      const res = await fetch('/api/journal/index-btst-compare');
      if (!res.ok) throw new Error('Failed to load compare data');
      return res.json();
    },
  });

  if (isLoading) {
    return <p className="text-sm text-text-secondary font-mono">Loading live vs backtest compare...</p>;
  }
  if (error || !data?.success) {
    return <p className="text-sm text-accent-red font-mono">Failed to load index BTST compare.</p>;
  }

  const { rows, summary, backtestRunName, backtestWindow, backtestRunId } = data;

  return (
    <div className="space-y-4 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Index BTST — Live vs Backtest</h2>
          <p className="text-[11px] text-text-secondary mt-1">
            Live = option CMP journal (CE). Backtest = index spot proxy from latest completed INDEX_BTST_DRIVEN run.
          </p>
          {backtestRunName && backtestWindow && (
            <p className="text-[10px] text-text-tertiary mt-1">
              Backtest: {backtestRunName} ({backtestWindow.start} → {backtestWindow.end})
              {backtestRunId && (
                <>
                  {' '}
                  ·{' '}
                  <Link href={`/backtest/${backtestRunId}`} className="text-accent-blue hover:underline">
                    open run
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded border border-border-primary text-text-secondary hover:text-text-primary"
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded border border-border-primary/60 bg-bg-secondary/40 p-3">
          <div className="text-[10px] text-text-tertiary uppercase">Matched days</div>
          <div className="text-lg font-bold text-text-primary">{summary.matchedDays}</div>
        </div>
        <div className="rounded border border-border-primary/60 bg-bg-secondary/40 p-3">
          <div className="text-[10px] text-text-tertiary uppercase">Live only</div>
          <div className="text-lg font-bold text-amber-400">{summary.liveOnly}</div>
        </div>
        <div className="rounded border border-border-primary/60 bg-bg-secondary/40 p-3">
          <div className="text-[10px] text-text-tertiary uppercase">Backtest only</div>
          <div className="text-lg font-bold text-accent-blue">{summary.backtestOnly}</div>
        </div>
        <div className="rounded border border-border-primary/60 bg-bg-secondary/40 p-3">
          <div className="text-[10px] text-text-tertiary uppercase">Live win % (closed)</div>
          <div className="text-lg font-bold text-text-primary">
            {summary.liveWinRate != null ? `${summary.liveWinRate.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-text-secondary py-8 text-center">
          No index BTST journal entries or backtest trades yet.
        </p>
      ) : (
        <div className="overflow-x-auto border border-border-primary rounded-lg">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="text-[10px] text-text-tertiary uppercase bg-bg-secondary/60 border-b border-border-primary">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2">Align</th>
                <th className="px-3 py-2">Live score</th>
                <th className="px-3 py-2">Live opt P&L%</th>
                <th className="px-3 py-2">BT score</th>
                <th className="px-3 py-2">BT spot P&L%</th>
                <th className="px-3 py-2">BT exit</th>
                <th className="px-3 py-2">VIX / Regime</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: {
                symbol: string;
                signalDate: string;
                alignment: string;
                live: { score: number; pnlPct: number | null; optionContract: string } | null;
                backtest: {
                  score: number;
                  spotPnlPct: number | null;
                  status: string;
                  vixBand: string | null;
                  regimeTrend: string | null;
                } | null;
              }) => (
                <tr key={`${row.symbol}_${row.signalDate}`} className="border-b border-border-primary/30 hover:bg-bg-secondary/30">
                  <td className="px-3 py-2">{row.signalDate}</td>
                  <td className="px-3 py-2 font-bold">{row.symbol}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row.alignment === 'BOTH'
                          ? 'text-accent-green'
                          : row.alignment === 'LIVE_ONLY'
                            ? 'text-amber-400'
                            : 'text-accent-blue'
                      }
                    >
                      {row.alignment.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.live?.score ?? '—'}</td>
                  <td className={`px-3 py-2 ${(row.live?.pnlPct ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {row.live?.pnlPct != null ? `${row.live.pnlPct >= 0 ? '+' : ''}${row.live.pnlPct.toFixed(2)}%` : 'open'}
                  </td>
                  <td className="px-3 py-2">{row.backtest?.score ?? '—'}</td>
                  <td className={`px-3 py-2 ${(row.backtest?.spotPnlPct ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {row.backtest?.spotPnlPct != null
                      ? `${row.backtest.spotPnlPct >= 0 ? '+' : ''}${row.backtest.spotPnlPct.toFixed(3)}%`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{row.backtest?.status ?? '—'}</td>
                  <td className="px-3 py-2 text-text-secondary">
                    {row.backtest
                      ? `${row.backtest.vixBand ?? '—'} / ${row.backtest.regimeTrend ?? '—'}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
