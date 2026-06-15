'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export default function AnalyticsPage() {
  const params = useParams();
  const runId = params?.runId as string;

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['metrics', runId],
    queryFn: async () => {
      // Mock metrics fetch
      return { winRate: 55, profitFactor: 1.5, maxDrawdown: -12, expectancy: 0.5 };
    }
  });

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', runId],
    queryFn: async () => {
      // Mock chart data
      return [
        { period: 'Jan', value: 1000 },
        { period: 'Feb', value: 1500 },
        { period: 'Mar', value: 1200 },
        { period: 'Apr', value: 3000 },
      ];
    }
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground animate-pulse">Loading Analytics Context...</div>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-600">Performance Analytics</h1>
      <p className="text-muted-foreground">Run ID: {runId}</p>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Win Rate', value: `${metrics?.winRate}%` },
          { label: 'Profit Factor', value: metrics?.profitFactor },
          { label: 'Max Drawdown', value: `${metrics?.maxDrawdown}%` },
          { label: 'Expectancy', value: metrics?.expectancy }
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <h3 className="font-semibold mb-4 text-muted-foreground">Equity Curve</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={snapshots ?? []}>
              <XAxis dataKey="period" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33' }} />
              <Line type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          <h3 className="font-semibold mb-4 text-muted-foreground">Drawdown Profiler</h3>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={snapshots ?? []}>
              <XAxis dataKey="period" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33' }} />
              <Area type="monotone" dataKey="value" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </div>
  );
}
