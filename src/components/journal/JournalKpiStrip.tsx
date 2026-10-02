'use client';

import React, { useMemo } from 'react';
import { fmt, formatPct } from '@/utils/format';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Scale,
  Receipt,
  Percent,
  Activity,
} from 'lucide-react';

export interface JournalKpiStripProps {
  stats: {
    totalTrades: number;
    winners: number;
    winRate: number;
    avgPnlPct: number;
    byType?: {
      CPR?: { count: number; winRate: number };
      BTST?: { count: number; winRate: number };
      STBT?: { count: number; winRate: number };
    };
  } | null;
  entries: Array<{
    pnl: number | null;
    pnlPct: number | null;
    estimatedCharges?: number | null | undefined;
    estimatedNetPnl?: number | null | undefined;
    estimatedNetPnlPct?: number | null | undefined;
    signalType?: string;
  }>;
  totalFiltered: number;
}

export const JournalKpiStrip: React.FC<JournalKpiStripProps> = ({
  stats,
  entries,
  totalFiltered,
}) => {
  // Aggregate authoritative Gross P&L and modeled Estimated Net P&L across entries
  const metrics = useMemo(() => {
    let closedCount = 0;
    let winCount = 0;
    let grossPnlSum = 0;
    let grossPnlPctSum = 0;
    let estimatedChargesSum = 0;
    let estimatedNetPnlSum = 0;
    let estimatedNetPnlPctSum = 0;

    for (const e of entries) {
      if (e.pnl !== null && e.pnl !== undefined) {
        closedCount++;
        grossPnlSum += e.pnl;
        if (e.pnl > 0) winCount++;
        if (e.pnlPct !== null && e.pnlPct !== undefined) {
          grossPnlPctSum += e.pnlPct;
        }

        if (e.estimatedCharges !== null && e.estimatedCharges !== undefined) {
          estimatedChargesSum += e.estimatedCharges;
        }

        if (e.estimatedNetPnl !== null && e.estimatedNetPnl !== undefined) {
          estimatedNetPnlSum += e.estimatedNetPnl;
        } else {
          // Fallback if net pnl not explicitly populated
          estimatedNetPnlSum += (e.pnl - (e.estimatedCharges ?? 0));
        }

        if (e.estimatedNetPnlPct !== null && e.estimatedNetPnlPct !== undefined) {
          estimatedNetPnlPctSum += e.estimatedNetPnlPct;
        }
      }
    }

    const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : (stats?.winRate ?? 0);
    const avgGrossPct = closedCount > 0 ? grossPnlPctSum / closedCount : (stats?.avgPnlPct ?? 0);
    const avgNetPct = closedCount > 0 ? estimatedNetPnlPctSum / closedCount : 0;
    const frictionImpact = grossPnlSum - estimatedNetPnlSum;

    return {
      closedCount,
      openCount: Math.max(0, totalFiltered - closedCount),
      winCount,
      lossCount: closedCount - winCount,
      winRate,
      grossPnlSum,
      avgGrossPct,
      estimatedChargesSum,
      estimatedNetPnlSum,
      avgNetPct,
      frictionImpact,
    };
  }, [entries, stats, totalFiltered]);

  return (
    <div className="space-y-2 font-mono select-none">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* 1. Total Executions */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 flex flex-col justify-between hover:border-border-secondary transition-colors">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase tracking-wider">
            <span className="flex items-center gap-1 font-semibold">
              <Layers size={11} className="text-accent-blue" />
              Total Trades
            </span>
            <span className="text-[9px] bg-bg-tertiary px-1 rounded">{metrics.closedCount} Settled</span>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-text-primary tracking-tight">
              {totalFiltered}
            </div>
            <div className="text-[10px] text-text-secondary mt-0.5">
              Filtered Records
            </div>
          </div>
        </div>

        {/* 2. Open Positions */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 flex flex-col justify-between hover:border-border-secondary transition-colors">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase tracking-wider">
            <span className="flex items-center gap-1 font-semibold">
              <Activity size={11} className="text-accent-amber" />
              Open Positions
            </span>
            <span className={`text-[9px] font-bold px-1 rounded ${metrics.openCount > 0 ? 'bg-accent-amber/10 text-accent-amber' : 'bg-bg-tertiary text-text-tertiary'}`}>
              {metrics.openCount > 0 ? '● Active' : 'None'}
            </span>
          </div>
          <div className="mt-2">
            <div className={`text-xl font-bold tracking-tight ${metrics.openCount > 0 ? 'text-accent-amber' : 'text-text-primary'}`}>
              {metrics.openCount}
            </div>
            <div className="text-[10px] text-text-secondary mt-0.5">
              Awaiting Exit Trigger
            </div>
          </div>
        </div>

        {/* 3. Win Rate */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 flex flex-col justify-between hover:border-border-secondary transition-colors">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase tracking-wider">
            <span className="flex items-center gap-1 font-semibold">
              <Percent size={11} className="text-accent-green" />
              Win Rate
            </span>
            <span className={`text-[9px] font-bold px-1 rounded ${metrics.winRate >= 50 ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'}`}>
              {metrics.winCount}W &bull; {metrics.lossCount}L
            </span>
          </div>
          <div className="mt-2">
            <div className={`text-xl font-bold tracking-tight ${metrics.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
              {formatPct(metrics.winRate)}
            </div>
            <div className="text-[10px] text-text-secondary mt-0.5">
              Settled Accuracy
            </div>
          </div>
        </div>

        {/* 4. Authoritative Gross P&L */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 flex flex-col justify-between hover:border-border-secondary transition-colors">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase tracking-wider">
            <span className="flex items-center gap-1 font-semibold">
              {metrics.grossPnlSum >= 0 ? (
                <TrendingUp size={11} className="text-accent-green" />
              ) : (
                <TrendingDown size={11} className="text-accent-red" />
              )}
              Gross P&amp;L
            </span>
            <span className="text-[9px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">FACT</span>
          </div>
          <div className="mt-2">
            <div className={`text-xl font-bold tracking-tight ${metrics.grossPnlSum >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {metrics.grossPnlSum >= 0 ? '+' : ''}₹{fmt(metrics.grossPnlSum)}
            </div>
            <div className="text-[10px] text-text-secondary mt-0.5">
              Avg {metrics.avgGrossPct >= 0 ? '+' : ''}{formatPct(metrics.avgGrossPct)} / trade
            </div>
          </div>
        </div>

        {/* 5. Modeled Estimated Net P&L */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 flex flex-col justify-between hover:border-border-secondary transition-colors">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase tracking-wider">
            <span className="flex items-center gap-1 font-semibold">
              <Scale size={11} className="text-accent-blue" />
              Estimated Net
            </span>
            <span className="text-[9px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">MODEL</span>
          </div>
          <div className="mt-2">
            <div className={`text-xl font-bold tracking-tight ${metrics.estimatedNetPnlSum >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {metrics.estimatedNetPnlSum >= 0 ? '+' : ''}₹{fmt(metrics.estimatedNetPnlSum)}
            </div>
            <div className="text-[10px] text-text-secondary mt-0.5">
              Avg {metrics.avgNetPct >= 0 ? '+' : ''}{formatPct(metrics.avgNetPct)} net
            </div>
          </div>
        </div>

        {/* 6. Estimated Charges & Friction Drag */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 flex flex-col justify-between hover:border-border-secondary transition-colors">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase tracking-wider">
            <span className="flex items-center gap-1 font-semibold">
              <Receipt size={11} className="text-accent-amber" />
              Friction Drag
            </span>
            <span className="text-[9px] bg-accent-amber/10 text-accent-amber px-1 rounded">Delta</span>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-accent-amber tracking-tight">
              -₹{fmt(metrics.frictionImpact)}
            </div>
            <div className="text-[10px] text-text-tertiary mt-0.5">
              ₹{fmt(metrics.estimatedChargesSum)} statutory fees
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JournalKpiStrip;

