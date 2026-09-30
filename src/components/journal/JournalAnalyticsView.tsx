'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { fmt, formatPct } from '@/utils/format';
import { JournalTradeData } from './TradeDetailDrawer';
import { Activity, PieChart as PieChartIcon, BarChart3, Scale } from 'lucide-react';

export interface ReportingResponse {
  qualityBuckets: { groupValue: string; count: number; winRate: number; avgPnlPct: number }[];
  regimes: { groupValue: string; count: number; winRate: number; avgPnlPct: number }[];
  executionOutcomes: { groupValue: string; count: number; winRate: number; avgPnlPct: number }[];
  eventRisks: { groupValue: string; count: number; winRate: number; avgPnlPct: number }[];
  variance: { averageVariancePct: number; sampleSize: number };
}

export interface JournalAnalyticsViewProps {
  entries: JournalTradeData[];
  reportingData: ReportingResponse | null;
}

export const JournalAnalyticsView: React.FC<JournalAnalyticsViewProps> = ({
  entries,
  reportingData,
}) => {
  // 1. Direction Breakdown (LONG vs SHORT)
  const directionStats = React.useMemo(() => {
    let longCount = 0;
    let longWins = 0;
    let longGross = 0;
    let shortCount = 0;
    let shortWins = 0;
    let shortGross = 0;

    for (const e of entries) {
      if (e.pnl !== null) {
        const isLong = e.optionType === 'CE' || e.signalType === 'BTST';
        if (isLong) {
          longCount++;
          if (e.pnl > 0) longWins++;
          longGross += e.pnl;
        } else {
          shortCount++;
          if (e.pnl > 0) shortWins++;
          shortGross += e.pnl;
        }
      }
    }

    return [
      {
        name: 'LONG (CE/BTST)',
        count: longCount,
        winRate: longCount > 0 ? (longWins / longCount) * 100 : 0,
        grossPnl: longGross,
        color: '#22c55e',
      },
      {
        name: 'SHORT (PE/STBT)',
        count: shortCount,
        winRate: shortCount > 0 ? (shortWins / shortCount) * 100 : 0,
        grossPnl: shortGross,
        color: '#ef4444',
      },
    ];
  }, [entries]);

  // 2. Setup / Signal Type Breakdown (CPR vs BTST vs STBT)
  const setupStats = React.useMemo(() => {
    const map: Record<string, { count: number; wins: number; gross: number; estCharges: number }> = {
      CPR: { count: 0, wins: 0, gross: 0, estCharges: 0 },
      BTST: { count: 0, wins: 0, gross: 0, estCharges: 0 },
      STBT: { count: 0, wins: 0, gross: 0, estCharges: 0 },
    };

    for (const e of entries) {
      if (e.pnl !== null && map[e.signalType]) {
        map[e.signalType]!.count++;
        if (e.pnl > 0) map[e.signalType]!.wins++;
        map[e.signalType]!.gross += e.pnl;
        map[e.signalType]!.estCharges += (e.estimatedCharges ?? 0);
      }
    }

    return Object.entries(map).map(([key, val]) => ({
      name: key,
      trades: val.count,
      winRate: val.count > 0 ? (val.wins / val.count) * 100 : 0,
      grossPnl: val.gross,
      estCharges: val.estCharges,
      netPnl: val.gross - val.estCharges,
    }));
  }, [entries]);

  // 3. Friction Tier Distribution
  const frictionTierStats = React.useMemo(() => {
    const map: Record<string, { count: number; totalCharges: number }> = {};

    for (const e of entries) {
      const tier = e.frictionModelTier || 'FUTURES_PROXY';
      if (!map[tier]) map[tier] = { count: 0, totalCharges: 0 };
      map[tier]!.count++;
      map[tier]!.totalCharges += (e.estimatedCharges ?? 0);
    }

    return Object.entries(map).map(([tier, data]) => ({
      name: tier,
      count: data.count,
      charges: data.totalCharges,
    }));
  }, [entries]);

  return (
    <div className="space-y-5 font-mono select-none">
      {/* Top Quad: Direction & Setup Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Setup P&L and Win Rate */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border-primary/60">
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 size={14} className="text-accent-blue" />
              P&amp;L Performance by Setup
            </span>
            <span className="text-[10px] text-text-tertiary">Gross vs Net</span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={setupStats} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <XAxis dataKey="name" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={(v: number) => `₹${fmt(v)}`} />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    typeof value === 'number' ? `₹${fmt(value)}` : String(value ?? ''),
                    name === 'grossPnl' ? 'Gross P&L' : 'Net P&L',
                  ]}
                  contentStyle={{ backgroundColor: 'var(--color-bg-tertiary, #1f2937)', borderColor: 'var(--color-border-secondary, #374151)', fontSize: 11 }}
                />
                <Bar dataKey="grossPnl" fill="#3b82f6" name="grossPnl" radius={[4, 4, 0, 0]} />
                <Bar dataKey="netPnl" fill="#22c55e" name="netPnl" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[10px] pt-1 border-t border-border-primary/50">
            {setupStats.map((s) => (
              <div key={s.name} className="bg-bg-tertiary/40 p-1.5 rounded">
                <div className="text-text-tertiary uppercase">{s.name}</div>
                <div className="font-bold text-text-primary mt-0.5">{s.trades} trades</div>
                <div className={`font-semibold ${s.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                  {formatPct(s.winRate)} WR
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Directional Distribution (Long vs Short) */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border-primary/60">
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <PieChartIcon size={14} className="text-accent-green" />
              Directional Execution Split
            </span>
            <span className="text-[10px] text-text-tertiary">LONG (CE) vs SHORT (PE)</span>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={directionStats}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={65}
                    innerRadius={38}
                    paddingAngle={3}
                  >
                    {directionStats.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--color-bg-tertiary, #1f2937)', borderColor: 'var(--color-border-secondary, #374151)', fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-3 text-xs">
              {directionStats.map((d) => (
                <div key={d.name} className="bg-bg-tertiary/40 p-2.5 rounded border border-border-primary/40 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-text-primary flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </span>
                    <span className="text-[10px] text-text-tertiary">{d.count} trades</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-tertiary">Win Rate:</span>
                    <span className={`font-semibold ${d.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {formatPct(d.winRate)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-tertiary">Total P&amp;L:</span>
                    <span className={`font-bold ${d.grossPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {d.grossPnl >= 0 ? '+' : ''}₹{fmt(d.grossPnl)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: Friction Model Tier Breakdown & Reporting Quality Buckets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Friction Model Tiers */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border-primary/60">
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Scale size={14} className="text-accent-amber" />
              Statutory Friction Tiers (PR #254)
            </span>
            <span className="text-[10px] text-text-tertiary">Model Charges Incurred</span>
          </div>

          <div className="space-y-2">
            {frictionTierStats.map((tier) => (
              <div key={tier.name} className="bg-bg-tertiary/30 p-2 rounded border border-border-primary/40 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-text-primary">{tier.name}</span>
                  <div className="text-[10px] text-text-tertiary">{tier.count} executions assigned</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-accent-amber">-₹{fmt(tier.charges)}</div>
                  <div className="text-[9px] text-text-tertiary">Total Drag</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quality Bucket Reporting from Server */}
        {reportingData && reportingData.qualityBuckets.length > 0 && (
          <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border-primary/60">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Activity size={14} className="text-accent-blue" />
                Historical Quality Bucket Outcomes
              </span>
              <span className="text-[10px] text-text-tertiary">Server Aggregation</span>
            </div>

            <div className="space-y-2">
              {reportingData.qualityBuckets.map((bucket) => (
                <div key={bucket.groupValue} className="bg-bg-tertiary/30 p-2 rounded border border-border-primary/40 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-text-primary">{bucket.groupValue}</span>
                    <div className="text-[10px] text-text-tertiary">{bucket.count} samples</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${bucket.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {formatPct(bucket.winRate)} WR
                    </div>
                    <div className="text-[9px] text-text-secondary">Avg {formatPct(bucket.avgPnlPct)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JournalAnalyticsView;
