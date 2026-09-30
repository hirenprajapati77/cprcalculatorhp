'use client';

import React from 'react';
import { formatIST, fmt } from '@/utils/format';
import { useQuery } from '@tanstack/react-query';
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  Calendar,
  Activity,
  Layers,
  BarChart3,
} from 'lucide-react';

interface ChartsGridProps {
  runId: string;
}

export default function ChartsGrid({ runId }: ChartsGridProps) {
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
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2 font-mono select-none">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border border-border-primary bg-bg-secondary rounded-lg p-4 h-80 flex flex-col justify-between">
            <div className="h-4 w-1/3 bg-bg-tertiary rounded animate-pulse" />
            <div className="flex-1 bg-bg-tertiary/40 rounded mt-4 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.equityCurve.length === 0) {
    return (
      <div className="mt-4 text-center py-12 border border-border-primary bg-bg-secondary rounded-lg font-mono">
        <p className="text-xs text-text-tertiary">No trade data available to generate telemetry charts for this run.</p>
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: 'var(--color-bg-tertiary, #181d28)',
    borderColor: 'var(--color-border-primary, #272f40)',
    fontSize: 11,
    borderRadius: 6,
    color: 'var(--color-text-primary, #f0f4f8)',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2 font-mono select-none">
      {/* 1. Cumulative Equity Curve */}
      <div className="border border-border-primary bg-bg-secondary rounded-lg p-4 h-80 flex flex-col">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border-primary/60">
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp size={13} className="text-accent-green" />
            Cumulative Equity Curve
          </span>
          <span className="text-[9px] bg-accent-green/10 text-accent-green font-bold px-1.5 py-0.5 rounded">
            P&amp;L ACCUMULATION
          </span>
        </div>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.equityCurve} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatIST(v, { dateOnly: true })}
                stroke="#6b7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `₹${fmt(v)}`}
                width={70}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(v) => formatIST(v, { dateOnly: true })}
                formatter={(value) => [typeof value === 'number' ? `₹${fmt(value)}` : String(value ?? '—'), 'Cumulative P&L']}
              />
              <Area
                type="monotone"
                dataKey="cumulativePnl"
                stroke="#22c55e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#equityGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Monthly P&L Calendar Grid */}
      <div className="border border-border-primary bg-bg-secondary rounded-lg p-4 h-80 flex flex-col">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border-primary/60">
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            <Calendar size={13} className="text-accent-blue" />
            Monthly P&amp;L Performance Grid
          </span>
          <span className="text-[9px] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded">
            {data.monthlyPnl.length} MONTHS
          </span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 flex-1 overflow-y-auto pr-1">
          {data.monthlyPnl.map((item, idx) => {
            const isProfit = item.pnl >= 0;
            return (
              <div
                key={idx}
                className={`flex flex-col items-center justify-center p-2 rounded-md border text-center transition-colors ${
                  isProfit
                    ? 'bg-accent-green/10 border-accent-green/25 text-accent-green'
                    : 'bg-accent-red/10 border-accent-red/25 text-accent-red'
                }`}
              >
                <span className="text-[10px] text-text-secondary font-semibold">
                  {item.month} &apos;{String(item.year).slice(2)}
                </span>
                <span className="text-xs font-bold mt-0.5">
                  {item.pnl >= 0 ? '+' : ''}₹{fmt(item.pnl)}
                </span>
                <span className="text-[9px] text-text-tertiary mt-0.5">
                  {item.tradeCount} trades
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Drawdown Depth Chart */}
      <div className="border border-border-primary bg-bg-secondary rounded-lg p-4 h-80 flex flex-col">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border-primary/60">
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            <Activity size={13} className="text-accent-red" />
            Underwater Drawdown Profile
          </span>
          <span className="text-[9px] bg-accent-red/10 text-accent-red font-bold px-1.5 py-0.5 rounded">
            PEAK-TO-TROUGH
          </span>
        </div>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.drawdown} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.0} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatIST(v, { dateOnly: true })}
                stroke="#6b7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                width={50}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(v) => formatIST(v, { dateOnly: true })}
                formatter={(value) => [typeof value === 'number' ? `${value.toFixed(2)}%` : String(value ?? ''), 'Drawdown']}
              />
              <Area
                type="monotone"
                dataKey="drawdownPct"
                stroke="#ef4444"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#drawdownGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Win/Loss by Signal */}
      <div className="border border-border-primary bg-bg-secondary rounded-lg p-4 h-80 flex flex-col">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border-primary/60">
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={13} className="text-accent-blue" />
            Signal Breakdown (Wins vs Losses)
          </span>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1 text-accent-green font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-green" /> Wins
            </span>
            <span className="flex items-center gap-1 text-accent-red font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-red" /> Losses
            </span>
          </div>
        </div>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.signalBreakdown} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis
                dataKey="signal"
                type="category"
                stroke="#9ca3af"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={110}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="wins" name="Wins" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="losses" name="Losses" stackId="a" fill="#ef4444" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 5. Trade P&L Distribution Histogram */}
      <div className="border border-border-primary bg-bg-secondary rounded-lg p-4 h-80 lg:col-span-2 flex flex-col">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border-primary/60">
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            <BarChart3 size={13} className="text-accent-blue" />
            Trade P&amp;L Distribution (Frequency Buckets)
          </span>
          <span className="text-[10px] text-text-tertiary">₹500 INTERVALS</span>
        </div>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.tradeDistribution} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <XAxis dataKey="bucket" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: 'var(--color-bg-tertiary, #1f2937)', opacity: 0.4 }}
                formatter={(value: unknown) => [String(value ?? 0), 'Trades']}
                labelFormatter={(b: unknown) => `P&L Bracket: ₹${b}`}
              />
              <Bar dataKey="count" name="Trade Count">
                {data.tradeDistribution.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.minPnl >= 0 ? '#22c55e' : '#ef4444'}
                    fillOpacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
