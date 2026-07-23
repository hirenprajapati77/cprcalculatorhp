'use client';

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
      <p className="text-sm text-muted-foreground">No {title.toLowerCase()} slice data.</p>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-cyan-400">{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-muted-foreground border-b border-border/50">
            <tr>
              <th className="py-2 pr-4">Slice</th>
              <th className="py-2 pr-4">Trades</th>
              <th className="py-2 pr-4">Win %</th>
              <th className="py-2 pr-4">Expectancy</th>
              <th className="py-2 pr-4">Avg P&L %</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const s = slices[key];
              return (
                <tr key={key} className="border-b border-border/20">
                  <td className="py-2 pr-4 font-medium">{key}</td>
                  <td className="py-2 pr-4">{s.count}</td>
                  <td className="py-2 pr-4">{s.winRate.toFixed(1)}%</td>
                  <td className={`py-2 pr-4 ${s.expectancy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {s.expectancy >= 0 ? '+' : ''}{s.expectancy.toFixed(2)}
                  </td>
                  <td className={`py-2 pr-4 ${s.avgPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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

  if (isLoading) return <p className="text-muted-foreground">Loading index BTST slices...</p>;
  if (error) return <p className="text-red-400">Failed to load slice metrics.</p>;
  if (!data || data.tradeCount === 0) {
    return (
      <p className="text-muted-foreground">
        No INDEX_BTST_DRIVEN trades in this run. Use Strategy Mode → Index BTST when starting a backtest.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {data.tradeCount} index BTST trades — spot P&L proxy split by India VIX band and NIFTY regime at signal time.
      </p>
      <SliceTable title="By VIX Band" slices={data.slices.byVixBand} />
      <SliceTable title="By NIFTY Regime" slices={data.slices.byRegime} />
    </div>
  );
}
