'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';

const DynamicChartsGrid = dynamic(() => import('./ChartsGrid'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="border border-border bg-card rounded-xl p-4 h-80 flex flex-col">
          <div className="h-5 w-1/3 bg-white/10 rounded animate-pulse mb-4"></div>
          <div className="flex-1 bg-white/5 rounded animate-pulse"></div>
        </div>
      ))}
    </div>
  )
});

export default function AnalyticsPage() {
  const params = useParams();
  const runId = params?.runId as string | undefined;

  const { data: runData, isLoading } = useQuery({
    queryKey: ['metrics', runId],
    queryFn: async () => {
      const res = await fetch(`/api/backtest?runId=${runId}`);
      if (!res.ok) throw new Error('Failed to fetch run data');
      return res.json();
    },
    enabled: !!runId && runId !== 'undefined'
  });

  const metrics = runData?.metrics;

  if (!runId || runId === 'undefined') return (
    <div className="text-center py-16 text-muted-foreground">
      <p className="text-lg font-semibold mb-2">Invalid Run ID</p>
      <p className="text-sm">Please navigate to Analytics from a valid backtest run.</p>
    </div>
  );

  if (isLoading) return <div className="text-center py-12 text-muted-foreground animate-pulse">Loading Analytics Context...</div>;

  if (!metrics && runData) return (
    <div className="text-center py-16 text-muted-foreground">
      <p className="text-lg font-semibold mb-2">Metrics Not Yet Available</p>
      <p className="text-sm">Run status: <span className="font-mono text-cyan-400">{runData.status || 'UNKNOWN'}</span></p>
      <p className="text-xs mt-2">Metrics are computed once the backtest run completes. Please wait and refresh.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-600">Performance Analytics</h1>
      <p className="text-muted-foreground">Run ID: {runId}</p>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Win Rate', value: metrics?.winRate != null ? `${Number(metrics.winRate).toFixed(2)}%` : '—' },
          { label: 'Profit Factor', value: metrics?.profitFactor != null ? Number(metrics.profitFactor).toFixed(2) : '—' },
          { label: 'Max Drawdown', value: metrics?.maxDrawdown != null ? `${Number(metrics.maxDrawdown).toFixed(2)}%` : '—' },
          { label: 'Expectancy', value: metrics?.expectancy != null ? Number(metrics.expectancy).toFixed(2) : '—' }
        ].map((kpi, i) => (
          <motion.div 
            key={kpi.label}
            className="border border-border bg-card rounded-xl p-4 flex flex-col items-center justify-center text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <span className="text-sm text-muted-foreground mb-1">{kpi.label}</span>
            <span className="text-2xl font-bold text-foreground">{kpi.value}</span>
          </motion.div>
        ))}
      </div>

      {/* Charts Grid */}
      <DynamicChartsGrid runId={runId} />
    </div>
  );
}
