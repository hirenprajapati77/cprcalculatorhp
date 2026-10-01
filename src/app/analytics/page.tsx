'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Layers,
  Percent,
  TrendingUp,
  Activity,
  ShieldAlert,
  Sliders,
  RefreshCw,
  Search,
  ExternalLink,
  Flame,
  Award,
} from 'lucide-react';
import Link from 'next/link';

interface SignalStatItem {
  signal: string;
  trades: number;
  winRate: number;
  avgPnl: number;
  avgPnlPct: number;
  lift: number;
  liftExclusive: number;
  confidence: 'Low' | 'Medium' | 'High';
}

interface SignalsResponse {
  baselineTrades: number;
  baselineWinRate: number;
  signals: SignalStatItem[];
}

interface ReportingData {
  qualityBuckets: Array<{ groupValue: string; count: number; winRate: number; avgPnlPct: number }>;
  regimes: Array<{ groupValue: string; count: number; winRate: number; avgPnlPct: number }>;
  executionOutcomes: Array<{ groupValue: string; count: number; winRate: number; avgPnlPct: number }>;
  eventRisks: Array<{ groupValue: string; count: number; winRate: number; avgPnlPct: number }>;
  variance?: { averageVariancePct: number; sampleSize: number };
}

export default function AnalyticsDashboardPage() {
  const [activeTab, setActiveTab] = useState<'signals' | 'regimes' | 'quality' | 'execution'>('signals');
  const [signalSearch, setSignalSearch] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState<'ALL' | 'High' | 'Medium' | 'Low'>('ALL');

  // 1. Fetch Signal Analytics
  const {
    data: signalsData,
    isLoading: isLoadingSignals,
    refetch: refetchSignals,
    isFetching: isFetchingSignals,
  } = useQuery({
    queryKey: ['analyticsSignals'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/signals');
      if (!res.ok) throw new Error('Failed to load signal analytics');
      return res.json() as Promise<SignalsResponse>;
    },
  });

  // 2. Fetch Reporting Analytics
  const {
    data: reportingResponse,
    isLoading: isLoadingReporting,
    refetch: refetchReporting,
  } = useQuery({
    queryKey: ['reportingData'],
    queryFn: async () => {
      const res = await fetch('/api/reporting');
      if (!res.ok) throw new Error('Failed to load reporting data');
      return res.json() as Promise<{ success: boolean; data: ReportingData }>;
    },
  });

  const reportingData = reportingResponse?.data;

  const baselineTrades = signalsData?.baselineTrades ?? 0;
  const baselineWinRate = signalsData?.baselineWinRate ?? 0;
  const signals = signalsData?.signals || [];

  // Best signal by lift with at least Medium confidence
  const alphaLeader = signals
    .filter((s) => s.confidence !== 'Low')
    .sort((a, b) => b.lift - a.lift)[0];

  // Filter signals
  const filteredSignals = signals.filter((s) => {
    if (confidenceFilter !== 'ALL' && s.confidence !== confidenceFilter) return false;
    if (!signalSearch) return true;
    return s.signal.toLowerCase().includes(signalSearch.toLowerCase());
  });

  const handleRefreshAll = () => {
    refetchSignals();
    refetchReporting();
  };

  return (
    <div className="space-y-4 font-mono select-none">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-1.5 rounded-md bg-accent-blue/10 text-accent-blue shrink-0">
              <BarChart3 size={18} />
            </span>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Quantitative Research &amp; Signal Analytics Terminal
            </h1>
            <span className="text-[10px] bg-accent-green/10 text-accent-green border border-accent-green/20 px-2 py-0.5 rounded font-semibold uppercase shrink-0">
              Alpha Engine
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Empirical statistical evaluation across signals, regimes, quality factors, and execution outcomes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isFetchingSignals}
            className="p-1.5 rounded bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
            title="Refresh analytics telemetry"
          >
            <RefreshCw size={14} className={isFetchingSignals ? 'animate-spin' : ''} />
          </button>
          <Link
            href="/journal"
            className="inline-flex items-center gap-1.5 bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-secondary hover:text-text-primary border border-border-primary px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
          >
            <Layers size={13} />
            Trade Journal
          </Link>
          <Link
            href="/backtest"
            className="inline-flex items-center gap-1.5 bg-accent-blue hover:bg-accent-blue/90 text-white px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors"
          >
            <ExternalLink size={13} />
            Backtest Terminal
          </Link>
        </div>
      </div>

      {/* ── Top Portfolio KPI Strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Baseline Sample */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <Layers size={11} className="text-accent-blue" />
              Sample Size
            </span>
            <span className="text-[8px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">FACT</span>
          </div>
          <div className="text-xl font-bold text-text-primary mt-1">
            {isLoadingSignals ? '—' : baselineTrades}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Authoritative Trades</div>
        </div>

        {/* Baseline Win Rate */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <Percent size={11} className="text-accent-green" />
              Baseline Win %
            </span>
            <span className="text-[8px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">FACT</span>
          </div>
          <div className={`text-xl font-bold mt-1 ${baselineWinRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
            {isLoadingSignals ? '—' : `${baselineWinRate.toFixed(1)}%`}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Platform Population</div>
        </div>

        {/* Evaluated Signals */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <Sliders size={11} className="text-accent-blue" />
              Tracked Setups
            </span>
            <span className="text-[8px] bg-bg-tertiary text-text-tertiary px-1 rounded">ACTIVE</span>
          </div>
          <div className="text-xl font-bold text-text-primary mt-1">
            {isLoadingSignals ? '—' : signals.length}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Distinct Patterns</div>
        </div>

        {/* Alpha Leader */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <Award size={11} className="text-accent-amber" />
              Alpha Leader
            </span>
            <span className="text-[8px] bg-accent-amber/10 text-accent-amber font-bold px-1 rounded">LIFT</span>
          </div>
          <div className="text-sm font-bold text-text-primary mt-1 truncate" title={alphaLeader?.signal || 'N/A'}>
            {alphaLeader ? alphaLeader.signal : '—'}
          </div>
          <div className="text-[10px] text-accent-green font-bold mt-0.5">
            {alphaLeader ? `+${alphaLeader.lift.toFixed(1)}% vs base` : 'Awaiting data'}
          </div>
        </div>

        {/* Execution Variance */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 col-span-2 sm:col-span-4 lg:col-span-1">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <Activity size={11} className="text-text-secondary" />
              Slippage Spread
            </span>
            <span className="text-[8px] bg-bg-tertiary text-text-tertiary px-1 rounded">MODEL</span>
          </div>
          <div className="text-xl font-bold text-text-primary mt-1">
            {reportingData?.variance ? `${reportingData.variance.averageVariancePct.toFixed(2)}%` : '—'}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Execution Deviation</div>
        </div>
      </div>

      {/* ── Tabs Navigation ── */}
      <div className="flex items-center gap-1 border-b border-border-primary overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('signals')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'signals'
              ? 'border-accent-blue text-accent-blue bg-accent-blue/5'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Flame size={13} />
          Signal Analytics &amp; Alpha Lift
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('regimes')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'regimes'
              ? 'border-accent-blue text-accent-blue bg-accent-blue/5'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <TrendingUp size={13} />
          Market Regime Breakdown
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('quality')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'quality'
              ? 'border-accent-blue text-accent-blue bg-accent-blue/5'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Award size={13} />
          Quality Bucket Calibration
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('execution')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'execution'
              ? 'border-accent-blue text-accent-blue bg-accent-blue/5'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <ShieldAlert size={13} />
          Execution Outcomes &amp; Event Risk
        </button>
      </div>

      {/* ── Viewport ── */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
        {/* Tab 1: Signal Analytics & Alpha Lift Table */}
        {activeTab === 'signals' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-border-primary">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                  Signal Performance Matrix
                </span>
                <span className="text-[10px] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded">
                  {filteredSignals.length} Setups
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Confidence filter chips */}
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-text-tertiary uppercase font-semibold mr-1">Conf:</span>
                  {(['ALL', 'High', 'Medium', 'Low'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setConfidenceFilter(lvl)}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        confidenceFilter === lvl
                          ? 'bg-accent-blue text-white font-bold'
                          : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="Search signal..."
                    value={signalSearch}
                    onChange={(e) => setSignalSearch(e.target.value)}
                    className="bg-bg-tertiary border border-border-primary rounded px-2.5 py-1 pl-7 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue w-36 sm:w-48"
                  />
                </div>
              </div>
            </div>

            {isLoadingSignals ? (
              <div className="py-12 text-center text-xs text-text-tertiary">
                Loading quantitative signal analytics...
              </div>
            ) : filteredSignals.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left whitespace-nowrap font-mono">
                  <thead className="bg-bg-tertiary text-text-secondary text-[10px] uppercase tracking-wider border-b border-border-primary">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Signal Identifier</th>
                      <th className="py-2 px-3 font-semibold text-right">Trades</th>
                      <th className="py-2 px-3 font-semibold text-right">
                        Win % <span className="text-[8px] text-accent-green font-bold">FACT</span>
                      </th>
                      <th className="py-2 px-3 font-semibold text-right">Avg Return %</th>
                      <th className="py-2 px-3 font-semibold text-right" title="Signal Win% - Baseline Win% (baseline includes ALL trades)">
                        Lift (Incl)
                      </th>
                      <th className="py-2 px-3 font-semibold text-right" title="Signal Win% - Baseline Win% (baseline excludes this signal)">
                        Lift (Excl)
                      </th>
                      <th className="py-2 px-3 font-semibold text-center">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-primary/40">
                    {filteredSignals.map((s) => {
                      const liftColor = s.lift > 0 ? 'text-accent-green' : s.lift < 0 ? 'text-accent-red' : 'text-text-secondary';
                      const liftExclColor = s.liftExclusive > 0 ? 'text-accent-green' : s.liftExclusive < 0 ? 'text-accent-red' : 'text-text-secondary';
                      const wrColor = s.winRate >= 55 ? 'text-accent-green' : s.winRate >= 45 ? 'text-accent-amber' : 'text-accent-red';

                      const confBadge =
                        s.confidence === 'High' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-green/10 text-accent-green border border-accent-green/20">
                            High (100+)
                          </span>
                        ) : s.confidence === 'Medium' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-amber/10 text-accent-amber border border-accent-amber/20">
                            Medium (30+)
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-bg-tertiary text-text-tertiary border border-border-primary">
                            Low (&lt;30)
                          </span>
                        );

                      const isHp = s.signal.startsWith('HP_') || s.signal.startsWith('KGS_');

                      return (
                        <tr key={s.signal} className="hover:bg-bg-tertiary/40 transition-colors">
                          <td className="py-2 px-3">
                            <span className={`font-semibold ${
                              isHp
                                ? 'px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple border border-accent-purple/20'
                                : 'text-text-primary'
                            }`}>
                              {s.signal}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right text-text-secondary font-bold">
                            {s.trades}
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${wrColor}`}>
                            {s.winRate.toFixed(1)}%
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${s.avgPnlPct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {s.avgPnlPct >= 0 ? '+' : ''}{s.avgPnlPct.toFixed(2)}%
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${liftColor}`}>
                            {s.lift > 0 ? '+' : ''}{s.lift.toFixed(1)}%
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${liftExclColor}`}>
                            {s.liftExclusive > 0 ? '+' : ''}{s.liftExclusive.toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 text-center">{confBadge}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-text-tertiary">
                No signals match your filter criteria.
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Market Regime Analysis */}
        {activeTab === 'regimes' && (
          <div className="space-y-4">
            <div className="pb-2 border-b border-border-primary">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                NIFTY 50 Macro Regime Calibration
              </span>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                Evaluation of strategy performance across distinct directional market regimes at trade execution.
              </p>
            </div>

            {isLoadingReporting ? (
              <p className="text-xs text-text-tertiary">Loading regime metrics...</p>
            ) : reportingData?.regimes && reportingData.regimes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {reportingData.regimes.map((reg) => {
                  const isPositive = reg.avgPnlPct >= 0;
                  return (
                    <div key={reg.groupValue} className="bg-bg-tertiary border border-border-primary rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between pb-1 border-b border-border-primary/60">
                        <span className="text-xs font-bold text-text-primary">{reg.groupValue}</span>
                        <span className="text-[10px] bg-bg-secondary px-1.5 py-0.5 rounded text-text-secondary">
                          {reg.count} Trades
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-[10px] text-text-tertiary">Win Rate</div>
                          <div className={`text-base font-bold ${reg.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {reg.winRate.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-text-tertiary">Avg Return</div>
                          <div className={`text-base font-bold ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
                            {isPositive ? '+' : ''}{reg.avgPnlPct.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                      {/* Bar indicator */}
                      <div className="w-full bg-bg-secondary rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${reg.winRate >= 50 ? 'bg-accent-green' : 'bg-accent-red'}`}
                          style={{ width: `${Math.min(100, Math.max(5, reg.winRate))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-text-tertiary">
                No regime reporting records generated yet.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Quality Bucket Calibration */}
        {activeTab === 'quality' && (
          <div className="space-y-4">
            <div className="pb-2 border-b border-border-primary">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Multi-Factor Quality Bucket Calibration
              </span>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                Verification of edge monotonic separation across TRADEABLE, WATCHLIST, and LOW_QUALITY tiers.
              </p>
            </div>

            {isLoadingReporting ? (
              <p className="text-xs text-text-tertiary">Loading quality bucket calibration...</p>
            ) : reportingData?.qualityBuckets && reportingData.qualityBuckets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {reportingData.qualityBuckets.map((bucket) => {
                  const isTradeable = bucket.groupValue === 'TRADEABLE';
                  const isWatchlist = bucket.groupValue === 'WATCHLIST';
                  const badgeColor = isTradeable
                    ? 'border-accent-green/30 bg-accent-green/5'
                    : isWatchlist
                    ? 'border-accent-amber/30 bg-accent-amber/5'
                    : 'border-border-primary bg-bg-tertiary';

                  return (
                    <div key={bucket.groupValue} className={`border rounded-lg p-3 space-y-2 ${badgeColor}`}>
                      <div className="flex items-center justify-between pb-1 border-b border-border-primary/60">
                        <span className="text-xs font-bold text-text-primary">{bucket.groupValue}</span>
                        <span className="text-[10px] bg-bg-secondary px-1.5 py-0.5 rounded text-text-secondary">
                          {bucket.count} Trades
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-[10px] text-text-tertiary">Win Rate</div>
                          <div className={`text-base font-bold ${bucket.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {bucket.winRate.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-text-tertiary">Avg Return</div>
                          <div className={`text-base font-bold ${bucket.avgPnlPct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {bucket.avgPnlPct >= 0 ? '+' : ''}{bucket.avgPnlPct.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                      <div className="w-full bg-bg-secondary rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${bucket.winRate >= 50 ? 'bg-accent-green' : 'bg-accent-amber'}`}
                          style={{ width: `${Math.min(100, Math.max(5, bucket.winRate))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-text-tertiary">
                No quality bucket stats available.
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Execution Outcomes & Event Risk */}
        {activeTab === 'execution' && (
          <div className="space-y-4">
            <div className="pb-2 border-b border-border-primary">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Execution Outcomes &amp; Event Risk Sensitivity
              </span>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                Evaluation of exit outcomes and macro event risk penalties.
              </p>
            </div>

            {isLoadingReporting ? (
              <p className="text-xs text-text-tertiary">Loading execution metrics...</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Execution Outcomes */}
                <div className="border border-border-primary rounded-lg p-3 bg-bg-tertiary space-y-2">
                  <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                    Execution Settlement Outcomes
                  </h4>
                  <div className="space-y-1.5">
                    {(reportingData?.executionOutcomes || []).map((out) => (
                      <div key={out.groupValue} className="flex items-center justify-between text-xs py-1 border-b border-border-primary/40 last:border-b-0">
                        <span className="text-text-secondary font-semibold">{out.groupValue}</span>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-text-tertiary text-[11px]">{out.count} trades</span>
                          <span className={`font-bold ${out.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {out.winRate.toFixed(1)}% WR
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Event Risks */}
                <div className="border border-border-primary rounded-lg p-3 bg-bg-tertiary space-y-2">
                  <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                    Event Risk Gating Sensitivity
                  </h4>
                  <div className="space-y-1.5">
                    {(reportingData?.eventRisks || []).map((risk) => (
                      <div key={risk.groupValue} className="flex items-center justify-between text-xs py-1 border-b border-border-primary/40 last:border-b-0">
                        <span className="text-text-secondary font-semibold">{risk.groupValue}</span>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-text-tertiary text-[11px]">{risk.count} trades</span>
                          <span className={`font-bold ${risk.avgPnlPct >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {risk.avgPnlPct >= 0 ? '+' : ''}{risk.avgPnlPct.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
