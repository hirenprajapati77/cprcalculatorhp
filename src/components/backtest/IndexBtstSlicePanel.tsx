'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';

type SliceStats = {
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancy: number;
  avgPnlPct: number;
};

function SliceTable({
  title,
  slices,
}: {
  title: string;
  slices: Record<string, SliceStats>;
}) {
  const keys = Object.keys(slices).sort();
  if (keys.length === 0) {
    return (
      <div className="border border-border-primary rounded-lg p-3 bg-bg-secondary text-xs text-text-tertiary">
        No {title.toLowerCase()} slice data available.
      </div>
    );
  }

  return (
    <div className="space-y-2 border border-border-primary rounded-lg p-3 bg-bg-secondary font-mono">
      <h4 className="text-xs font-bold text-accent-blue uppercase tracking-wider">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
          <thead className="bg-bg-tertiary text-[10px] text-text-secondary uppercase tracking-wider border-b border-border-primary">
            <tr>
              <th className="py-1.5 px-3 font-semibold">Slice Segment</th>
              <th className="py-1.5 px-3 font-semibold text-right">Trades</th>
              <th className="py-1.5 px-3 font-semibold text-right">Win %</th>
              <th className="py-1.5 px-3 font-semibold text-right">Expectancy</th>
              <th className="py-1.5 px-3 font-semibold text-right">Avg P&amp;L %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-primary/40">
            {keys.map((key) => {
              const s = slices[key];
              if (!s) return null;
              return (
                <tr key={key} className="hover:bg-bg-tertiary/40 transition-colors">
                  <td className="py-1.5 px-3 font-semibold text-text-primary">{key}</td>
                  <td className="py-1.5 px-3 text-right text-text-secondary">{s.count}</td>
                  <td className={`py-1.5 px-3 text-right font-bold ${s.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {s.winRate.toFixed(1)}%
                  </td>
                  <td className={`py-1.5 px-3 text-right font-bold ${s.expectancy >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {s.expectancy >= 0 ? '+' : ''}{s.expectancy.toFixed(2)}
                  </td>
                  <td className={`py-1.5 px-3 text-right font-bold ${s.avgPnlPct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {s.avgPnlPct >= 0 ? '+' : ''}{s.avgPnlPct.toFixed(3)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function IndexBtstSlicePanel({ runId }: { runId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['indexBtstSlices', runId],
    queryFn: async () => {
      const res = await fetch(`/api/backtest/${runId}/index-btst-slices`);
      if (!res.ok) throw new Error('Failed to load index BTST slices');
      return res.json() as Promise<{
        tradeCount: number;
        slices: { byVixBand: Record<string, SliceStats>; byRegime: Record<string, SliceStats> };
      }>;
    },
  });

  if (isLoading) return <p className="text-xs text-text-tertiary font-mono">Loading index BTST slice matrix...</p>;
  if (error) return <p className="text-xs text-accent-red font-mono">Failed to load slice metrics.</p>;
  if (!data || data.tradeCount === 0) {
    return (
      <div className="border border-border-primary rounded-lg p-6 bg-bg-secondary text-center text-xs text-text-tertiary font-mono">
        No INDEX_BTST_DRIVEN trades in this run. Use Strategy Mode → Index BTST when configuring a backtest.
      </div>
    );
  }

  return (
    <div className="space-y-4 font-mono select-none">
      <div className="text-xs text-text-secondary bg-bg-tertiary p-2.5 rounded-md border border-border-primary">
        <span className="font-bold text-accent-blue">{data.tradeCount}</span> index BTST trades — spot P&amp;L proxy split by India VIX band and NIFTY regime at signal generation.
      </div>
      <SliceTable title="Distribution by India VIX Band" slices={data.slices.byVixBand} />
      <SliceTable title="Distribution by NIFTY Market Regime" slices={data.slices.byRegime} />
    </div>
  );
}
