'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

export default function ChartsGrid({ runId }: { runId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', runId],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?runId=${runId}`);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json() as Promise<{
        equityCurve: Array<{ date: string; cumulativePnl: number }>;
        monthlyPnl: Array<{ month: string; year: number; pnl: number; tradeCount: number }>;
        drawdown: Array<{ date: string; drawdownPct: number; peakEquity: number }>;
        signalBreakdown: Array<{ signal: string; wins: number; losses: number; winRate: number; avgPnl: number }>;
        tradeDistribution: Array<{ bucket: string; count: number; minPnl: number; maxPnl: number }>;
      }>;
    }
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="border border-border bg-card rounded-xl p-4 h-80 flex flex-col">
            <div className="h-5 w-1/3 bg-white/10 rounded animate-pulse mb-4"></div>
            <div className="flex-1 bg-white/5 rounded animate-pulse"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.equityCurve.length === 0) {
    return (
      <div className="mt-8 text-center py-12 border border-border bg-card rounded-xl">
        <p className="text-muted-foreground">No chart data available for this run.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
      {/* 1. Equity Curve */}
      <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wider">Equity Curve</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.equityCurve}>
            <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} width={70} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 12 }} 
              labelFormatter={(v) => new Date(v).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
              formatter={(value) => value != null ? [`₹${Number(value).toLocaleString('en-IN')}`, 'Cumulative PnL'] : ['—', 'Cumulative PnL']}
            />
            <Line type="monotone" dataKey="cumulativePnl" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      {/* 2. Monthly PnL */}
      <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wider">Monthly PnL Heatmap</h3>
        <div className="grid grid-cols-6 gap-2 h-full pb-8">
          {data.monthlyPnl.map((item, idx) => (
            <div key={idx} className="flex flex-col items-center justify-center rounded text-xs" style={{
              backgroundColor: item.pnl > 0 ? `rgba(34, 197, 94, ${Math.min(1, Math.max(0.2, item.pnl / 10000))})` : `rgba(239, 68, 68, ${Math.min(1, Math.max(0.2, Math.abs(item.pnl) / 10000))})`
            }}>
              <span className="font-semibold text-white/90 mb-1">{item.month} '{String(item.year).slice(2)}</span>
              <span className="text-white/80">₹{item.pnl.toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* 3. Drawdown Chart */}
      <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
        <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wider">Drawdown</h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.drawdown}>
            <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(1)}%`} width={40} />
            <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 12 }} labelFormatter={(v) => new Date(v).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })} formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Drawdown']} />
            <Area type="monotone" dataKey="drawdownPct" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* 4. Win/Loss by Signal */}
      <motion.div className="border border-border bg-card rounded-xl p-4 h-80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wider">Win/Loss by Signal</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.signalBreakdown} layout="vertical" margin={{ left: 50 }}>
            <XAxis type="number" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis dataKey="signal" type="category" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} width={100} />
            <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 12 }} />
            <Bar dataKey="wins" name="Wins" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
            <Bar dataKey="losses" name="Losses" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* 5. Trade Distribution */}
      <motion.div className="border border-border bg-card rounded-xl p-4 h-80 lg:col-span-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        <h3 className="font-semibold mb-4 text-muted-foreground text-sm uppercase tracking-wider">Trade Distribution (PnL)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.tradeDistribution}>
            <XAxis dataKey="bucket" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={10} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 12 }} cursor={{ fill: '#ffffff10' }} />
            <Bar dataKey="count" name="Trade Count">
              {data.tradeDistribution.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.minPnl >= 0 ? '#22c55e' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

    </div>
  );
}
