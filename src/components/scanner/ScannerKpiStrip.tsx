'use client';

import React from 'react';
import {
  Layers,
  Activity,
  Award,
  Clock,
  TrendingUp,
  Target,
  AlertTriangle,
  Star,
  Sparkles,
  Filter,
} from 'lucide-react';
import type { OvernightScanMetrics } from '@/services/overnight/overnight-scan-metrics';

export type ScannerMode = 'CPR' | 'BTST' | 'STBT' | 'OVERNIGHT' | 'INDEX';

interface ScannerKpiStripProps {
  scannerMode: ScannerMode;
  universe: string;
  totalActiveSignals: number;
  averageUniverseScore: number;
  isLoading: boolean;
  isRefreshing: boolean;
  latency: number;
  btstMetrics: { ready: number; strong: number; avgGap: number; avgConf: number };
  indexMetrics: { strong: number; ready: number; watch: number; ignore: number };
  strongBuyCount: number;
  breakoutReadyCount: number;
  watchlistCount: number;
  avoidCount: number;
  topStocks: Array<{ symbol: string; score: number; alertSuppressedReason?: string | null }>;
  overnightMetrics?: OvernightScanMetrics | null;
}

export interface LastScanIndicatorResult {
  formatted: string | null;
  isStale: boolean;
}

export function formatLastScanTimestamp(
  lastScanAt?: string | null,
  now: Date = new Date()
): LastScanIndicatorResult {
  if (!lastScanAt) {
    return { formatted: null, isStale: false };
  }

  const scanDate = new Date(lastScanAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const isStale = scanDate !== todayDate;

  const timeStr = new Date(lastScanAt).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isStale) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const dayLabel = scanDate === yesterdayDate ? 'Yesterday' : scanDate;
    return { formatted: `⚠ Last scan: ${dayLabel} ${timeStr} IST`, isStale: true };
  }

  return { formatted: `Last scan: ${timeStr} IST`, isStale: false };
}

export const ScannerKpiStrip: React.FC<ScannerKpiStripProps> = ({
  scannerMode,
  universe,
  totalActiveSignals,
  averageUniverseScore,
  isLoading,
  isRefreshing,
  latency,
  btstMetrics,
  indexMetrics,
  strongBuyCount,
  breakoutReadyCount,
  watchlistCount,
  avoidCount,
  topStocks,
  overnightMetrics,
}) => {
  const isOvernight = scannerMode === 'BTST' || scannerMode === 'STBT' || scannerMode === 'OVERNIGHT';

  const { formatted: lastScanFormatted, isStale } = formatLastScanTimestamp(overnightMetrics?.lastScanAt);

  return (
    <div className="space-y-3 font-mono">
      {/* ── Telemetry & Engine Bar ── */}
      <div className="bg-surface-panel border border-border-default rounded-lg px-3.5 py-2.5 text-[11px] grid grid-cols-2 sm:grid-cols-6 items-center gap-3 text-text-secondary">
        <div className="flex items-center gap-1.5 border-r border-border-subtle last:border-none pr-2">
          <Layers size={13} className="text-accent-primary" />
          <span className="text-text-muted">Universe:</span>
          <span className="font-bold text-text-primary uppercase truncate">
            {universe === 'NIFTY_FNO' ? 'NSE F&O' : universe}
          </span>
        </div>
        <div className="flex items-center gap-1.5 border-r border-border-subtle last:border-none pr-2">
          <Activity size={13} className="text-trading-bullish" />
          <span className="text-text-muted">Active:</span>
          <span className="font-bold text-text-primary">{totalActiveSignals}</span>
        </div>
        <div className="flex items-center gap-1.5 border-r border-border-subtle last:border-none pr-2">
          <Award size={13} className="text-purple-400" />
          <span className="text-text-muted">Avg Score:</span>
          <span className="font-bold text-text-primary">{averageUniverseScore.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-1.5 border-r border-border-subtle last:border-none pr-2">
          <Clock size={13} className="text-amber-400" />
          <span className="text-text-muted">State:</span>
          <span className="font-bold text-text-primary uppercase">
            {isLoading || isRefreshing ? 'Scanning' : 'Idle'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 border-r border-border-subtle last:border-none pr-2">
          <TrendingUp size={13} className="text-cyan-400" />
          <span className="text-text-muted">Latency:</span>
          <span className="font-bold text-text-primary">{latency}ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-emerald-400 uppercase tracking-wide text-[10px]">
            TELEMETRY OK
          </span>
        </div>
      </div>

      {/* ── Top Algos Marquee Strip ── */}
      {(() => {
        const actionableTop = topStocks.filter((s) => !s.alertSuppressedReason);
        if (actionableTop.length === 0) return null;
        return (
          <div className="bg-surface-elevated border border-border-subtle rounded-lg px-3.5 py-1.5 text-[10px] text-text-secondary flex flex-wrap items-center gap-2">
            <Sparkles size={12} className="text-accent-primary animate-pulse flex-shrink-0" />
            <span className="font-bold text-text-primary uppercase tracking-wider text-[9px]">
              Top Algo Setups:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {actionableTop.map((s, idx) => (
                <span key={s.symbol} className="flex items-center gap-1">
                  <span className="text-text-primary font-bold">{s.symbol}</span>
                  <span className="text-text-muted">({s.score} pts)</span>
                  {idx < actionableTop.length - 1 && <span className="text-border-strong">|</span>}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Overnight Scan Funnel Observability Strip ── */}
      {isOvernight && overnightMetrics && (
        <div className="bg-surface-panel border border-border-default rounded-lg px-3.5 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2.5 text-text-secondary">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-accent-primary font-bold uppercase tracking-wider text-[10px]">
              <Filter size={12} />
              <span>Funnel:</span>
            </div>
            <span className="text-text-primary">
              Universe <strong className="text-text-primary">{overnightMetrics.universeSize}</strong>
            </span>
            <span className="text-border-strong">·</span>
            <span className="text-text-primary">
              Processed <strong className="text-text-primary">{overnightMetrics.processed}</strong>
            </span>
            <span className="text-border-strong">·</span>
            <span className="text-text-primary">
              Saved <strong className={overnightMetrics.saved > 0 ? 'text-trading-bullish' : 'text-text-muted'}>{overnightMetrics.saved}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="px-1.5 py-0.5 rounded bg-surface-elevated border border-border-subtle text-text-muted">
              eligibility=<span className="text-text-secondary font-semibold">{overnightMetrics.droppedEligibility}</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-elevated border border-border-subtle text-text-muted">
              regime=<span className="text-text-secondary font-semibold">{overnightMetrics.droppedRegime}</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-elevated border border-border-subtle text-text-muted">
              friday=<span className="text-text-secondary font-semibold">{overnightMetrics.droppedFridayGate}</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-elevated border border-border-subtle text-text-muted">
              extension=<span className="text-text-secondary font-semibold">{overnightMetrics.droppedExtension}</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-elevated border border-border-subtle text-text-muted">
              conflict=<span className="text-text-secondary font-semibold">{overnightMetrics.droppedConflict}</span>
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-elevated border border-border-subtle text-text-muted">
              noIntraday=<span className="text-text-secondary font-semibold">{overnightMetrics.droppedNoIntraday}</span>
            </span>
            <span className={`px-1.5 py-0.5 rounded border ${
              overnightMetrics.errors > 0
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 font-bold'
                : 'bg-surface-elevated border-border-subtle text-text-muted'
            }`}>
              errors=<span className={overnightMetrics.errors > 0 ? 'text-rose-400 font-bold' : 'text-text-secondary font-semibold'}>{overnightMetrics.errors}</span>
            </span>
          </div>
        </div>
      )}

      {/* ── Dynamic Setup Metrics Strip ── */}
      {isOvernight ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">BTST Ready</span>
              <h2 className="text-2xl font-bold text-accent-primary">{btstMetrics.ready}</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-accent-primary/10 border border-accent-primary/25 flex items-center justify-center text-accent-primary">
              <TrendingUp size={17} />
            </div>
          </div>
          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">Strong BTST</span>
              <h2 className="text-2xl font-bold text-trading-bullish">{btstMetrics.strong}</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-trading-bullish">
              <Award size={17} />
            </div>
          </div>
          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">Avg Expected Gap %</span>
              <h2 className="text-2xl font-bold text-purple-400">+{btstMetrics.avgGap.toFixed(2)}%</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400">
              <Activity size={17} />
            </div>
          </div>
          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">Avg Confluence</span>
              <h2 className="text-2xl font-bold text-amber-400">{btstMetrics.avgConf.toFixed(0)}/100</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <Target size={17} />
            </div>
          </div>
        </div>
      ) : scannerMode === 'INDEX' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">Index Strong</span>
              <p className="text-[9px] text-text-muted">INTRA ≥75 / BTST 100</p>
              <h2 className="text-2xl font-bold text-purple-400">{indexMetrics.strong}</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400">
              <Award size={17} />
            </div>
          </div>
          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">Index Ready</span>
              <p className="text-[9px] text-text-muted">INTRA ≥60 / BTST ≥85</p>
              <h2 className="text-2xl font-bold text-trading-bullish">{indexMetrics.ready}</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-trading-bullish">
              <TrendingUp size={17} />
            </div>
          </div>
          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">Index Watch</span>
              <p className="text-[9px] text-text-muted">INTRA ≥40 / BTST ≥70</p>
              <h2 className="text-2xl font-bold text-amber-400">{indexMetrics.watch}</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <Activity size={17} />
            </div>
          </div>
          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">Ignore</span>
              <p className="text-[9px] text-text-muted">Below watch / inside CPR</p>
              <h2 className="text-2xl font-bold text-trading-bearish">{indexMetrics.ignore}</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-trading-bearish">
              <AlertTriangle size={17} />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">Strong Signal</span>
              <p className="text-[9px] text-text-muted">Score ≥ 75</p>
              <h2 className="text-2xl font-bold text-purple-400">{strongBuyCount}</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400">
              <Award size={17} />
            </div>
          </div>

          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">Breakout Ready</span>
              <p className="text-[9px] text-text-muted">Score 60-74</p>
              <h2 className="text-2xl font-bold text-trading-bullish">{breakoutReadyCount}</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-trading-bullish">
              <TrendingUp size={17} />
            </div>
          </div>

          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">Watchlist Items</span>
              <p className="text-[9px] text-text-muted">Pinned for monitor</p>
              <h2 className="text-2xl font-bold text-amber-400">{watchlistCount}</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <Star size={17} fill="currentColor" />
            </div>
          </div>

          <div className="bg-surface-panel border border-border-default p-3.5 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-text-muted uppercase">Avoid / Ignore</span>
              <p className="text-[9px] text-text-muted">Score &lt; 40 or Conflict</p>
              <h2 className="text-2xl font-bold text-trading-bearish">{avoidCount}</h2>
            </div>
            <div className="h-9 w-9 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-trading-bearish">
              <AlertTriangle size={17} />
            </div>
          </div>
        </div>
      )}

      {/* ── Last Scan Staleness Indicator ── */}
      {lastScanFormatted && (
        <div className="flex items-center justify-end px-1 -mt-1">
          <span
            className={
              isStale
                ? 'text-xs text-amber-400 font-medium'
                : 'text-xs text-muted-foreground text-text-muted'
            }
          >
            {lastScanFormatted}
          </span>
        </div>
      )}
    </div>
  );
};

export default ScannerKpiStrip;
