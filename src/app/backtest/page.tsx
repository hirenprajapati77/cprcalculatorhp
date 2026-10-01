'use client';

import React, { useState } from 'react';
import { formatIST, fmt } from '@/utils/format';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  RotateCcw,
  Activity,
  ExternalLink,
  RefreshCw,
  Search,
  FlaskConical,
  BarChart3,
  Sliders,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import Link from 'next/link';

interface BacktestRunItem {
  id: string;
  status: string;
  universe?: string;
  strategyMode?: string;
  _count?: { trades: number };
  createdAt: string;
  metrics?: {
    winRate?: number;
    profitFactor?: number;
    sharpe?: number;
    maxDrawdown?: number;
    expectancy?: number;
  };
}

export default function BacktestPage() {
  const queryClient = useQueryClient();

  // Form State
  const [universe, setUniverse] = useState('NIFTY50');
  const [capital, setCapital] = useState(100000);
  const [startDate, setStartDate] = useState('2023-01-01');
  const [endDate, setEndDate] = useState('2023-06-30');
  const [riskPercent, setRiskPercent] = useState(1.0);
  const [exitStrategy, setExitStrategy] = useState('target');
  const [executionMode, setExecutionMode] = useState('conservative');
  const [strategyMode, setStrategyMode] = useState('LEGACY_NARROW_CPR');

  // Presentation States
  const [searchTerm, setSearchTerm] = useState('');
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');

  const { data: rawRuns, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['backtests'],
    queryFn: async () => {
      const res = await fetch('/api/backtest');
      if (!res.ok) throw new Error('Failed to fetch runs');
      return res.json() as Promise<BacktestRunItem[]>;
    },
  });

  const runs = (rawRuns || []) as BacktestRunItem[];

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Run ${new Date().toISOString()}`,
          universe,
          startDate,
          endDate,
          capital,
          riskPercent,
          exitStrategy,
          executionMode,
          strategyMode,
        }),
      });
      if (res.status === 503) {
        throw new Error('Backtest engine is currently unavailable. Please try again later.');
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to start backtest');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['backtests'] });
      if (data.status === 'QUEUED') {
        alert(`Backtest queued! Run ID: ${data.jobId}\nProcessing in background. Refresh the table to monitor progress.`);
      }
    },
    onError: (err: Error) => {
      alert(`Error: ${err.message}`);
    },
  });

  const handleApplyPreset = (type: 'NARROW_CPR' | 'STOCK_BTST' | 'INDEX_BTST') => {
    if (type === 'NARROW_CPR') {
      setUniverse('NIFTY50');
      setStrategyMode('LEGACY_NARROW_CPR');
      setExecutionMode('conservative');
      setRiskPercent(1.0);
      setExitStrategy('target');
    } else if (type === 'STOCK_BTST') {
      setUniverse('NSE_FNO');
      setStrategyMode('BTST_STBT_DRIVEN');
      setExecutionMode('conservative');
      setRiskPercent(1.5);
      setExitStrategy('target');
    } else if (type === 'INDEX_BTST') {
      setUniverse('NIFTY50');
      setStrategyMode('INDEX_BTST_DRIVEN');
      setExecutionMode('conservative');
      setRiskPercent(1.0);
      setExitStrategy('target');
    }
  };

  const handleResetForm = () => {
    setUniverse('NIFTY50');
    setCapital(100000);
    setStartDate('2023-01-01');
    setEndDate('2023-06-30');
    setRiskPercent(1.0);
    setExitStrategy('target');
    setExecutionMode('conservative');
    setStrategyMode('LEGACY_NARROW_CPR');
  };

  // Filter runs
  const filteredRuns = runs.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.id.toLowerCase().includes(term) ||
      (r.status && r.status.toLowerCase().includes(term)) ||
      (r.universe && r.universe.toLowerCase().includes(term)) ||
      (r.strategyMode && r.strategyMode.toLowerCase().includes(term))
    );
  });

  const completedCount = runs.filter((r) => r.status?.toLowerCase() === 'completed').length;
  const runningCount = runs.filter((r) => ['running', 'queued'].includes(r.status?.toLowerCase() || '')).length;

  return (
    <div className="space-y-4 font-mono select-none">
      {/* ── Page Context & Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-accent-blue/10 text-accent-blue">
              <FlaskConical size={18} />
            </span>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Backtest &amp; Quantitative Simulation Terminal
            </h1>
            <span className="text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
              Workstation
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Historical walk-forward backtest simulations with conservative friction execution.
          </p>
        </div>

        {/* Global Runs KPI */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="bg-bg-tertiary border border-border-primary px-3 py-1.5 rounded-md flex items-center gap-2">
            <Layers size={13} className="text-text-tertiary" />
            <span className="text-text-secondary text-[11px]">Total Runs:</span>
            <span className="font-bold text-text-primary">{runs.length}</span>
          </div>
          <div className="bg-bg-tertiary border border-border-primary px-3 py-1.5 rounded-md flex items-center gap-2">
            <CheckCircle2 size={13} className="text-accent-green" />
            <span className="text-text-secondary text-[11px]">Settled:</span>
            <span className="font-bold text-accent-green">{completedCount}</span>
          </div>
          {runningCount > 0 && (
            <div className="bg-accent-blue/10 border border-accent-blue/30 px-3 py-1.5 rounded-md flex items-center gap-2 text-accent-blue">
              <Clock size={13} className="animate-spin" />
              <span className="text-[11px] font-bold">{runningCount} Active</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Workstation Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Persistent Configuration Panel (4 cols) */}
        <div className="lg:col-span-4 bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border-primary">
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Sliders size={14} className="text-accent-blue" />
              Run Configuration
            </span>
            <button
              type="button"
              onClick={handleResetForm}
              className="text-[10px] text-text-tertiary hover:text-text-primary flex items-center gap-1 transition-colors"
              title="Reset parameters to platform defaults"
            >
              <RotateCcw size={11} />
              Reset
            </button>
          </div>

          {/* Quick Setup Presets */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-text-tertiary uppercase font-semibold">Strategy Presets</span>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <button
                type="button"
                onClick={() => handleApplyPreset('NARROW_CPR')}
                className={`px-2 py-1 rounded border text-center font-medium transition-colors ${
                  strategyMode === 'LEGACY_NARROW_CPR'
                    ? 'bg-accent-blue text-white border-accent-blue font-bold'
                    : 'bg-bg-tertiary text-text-secondary border-border-primary hover:text-text-primary'
                }`}
              >
                Narrow CPR
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('STOCK_BTST')}
                className={`px-2 py-1 rounded border text-center font-medium transition-colors ${
                  strategyMode === 'BTST_STBT_DRIVEN'
                    ? 'bg-accent-blue text-white border-accent-blue font-bold'
                    : 'bg-bg-tertiary text-text-secondary border-border-primary hover:text-text-primary'
                }`}
              >
                Stock BTST
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('INDEX_BTST')}
                className={`px-2 py-1 rounded border text-center font-medium transition-colors ${
                  strategyMode === 'INDEX_BTST_DRIVEN'
                    ? 'bg-accent-blue text-white border-accent-blue font-bold'
                    : 'bg-bg-tertiary text-text-secondary border-border-primary hover:text-text-primary'
                }`}
              >
                Index BTST
              </button>
            </div>
          </div>

          {/* Configuration Form Controls */}
          <div className="space-y-3 text-xs">
            <div>
              <label className="text-[11px] text-text-tertiary font-semibold block mb-1">
                Universe Scope
              </label>
              <select
                value={universe}
                onChange={(e) => setUniverse(e.target.value)}
                className="w-full bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2.5 py-1.5 focus:outline-none focus:border-accent-blue"
              >
                <option value="NIFTY50">NIFTY 50 Benchmark</option>
                <option value="NSE_FNO">NSE F&amp;O Equities (~211 Symbols)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-text-tertiary font-semibold block mb-1">
                Initial Capital (₹)
              </label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                className="w-full bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2.5 py-1.5 focus:outline-none focus:border-accent-blue font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-text-tertiary font-semibold block mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2 py-1.5 focus:outline-none focus:border-accent-blue font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="text-[11px] text-text-tertiary font-semibold block mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2 py-1.5 focus:outline-none focus:border-accent-blue font-mono text-[11px]"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-text-tertiary font-semibold block mb-1">
                Strategy Mode
              </label>
              <select
                value={strategyMode}
                onChange={(e) => setStrategyMode(e.target.value)}
                className="w-full bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2.5 py-1.5 focus:outline-none focus:border-accent-blue"
              >
                <option value="LEGACY_NARROW_CPR">Legacy Narrow CPR Breakout</option>
                <option value="SCANNER_DRIVEN">Scanner-Driven Confluence</option>
                <option value="BTST_STBT_DRIVEN">Stock BTST / STBT Overnight</option>
                <option value="INDEX_BTST_DRIVEN">Index BTST (NIFTY / BANKNIFTY)</option>
              </select>
              {strategyMode === 'INDEX_BTST_DRIVEN' && (
                <p className="text-[10px] text-accent-blue mt-1 leading-relaxed bg-accent-blue/5 p-1.5 rounded border border-accent-blue/15">
                  Uses production IndexRankingService (130pt) with historical 5m VWAP. P&amp;L modeled as index spot proxy.
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-text-tertiary font-semibold block mb-1">
                  Risk %
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value))}
                  className="w-full bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2 py-1.5 focus:outline-none focus:border-accent-blue font-mono text-center"
                />
              </div>
              <div>
                <label className="text-[11px] text-text-tertiary font-semibold block mb-1">
                  Exit Mode
                </label>
                <select
                  value={exitStrategy}
                  onChange={(e) => setExitStrategy(e.target.value)}
                  className="w-full bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-1.5 py-1.5 focus:outline-none focus:border-accent-blue text-[11px]"
                >
                  <option value="target">Target 1:1</option>
                  <option value="trail">Trailing SL</option>
                  <option value="eod">End of Day</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-text-tertiary font-semibold block mb-1">
                  Execution
                </label>
                <select
                  value={executionMode}
                  onChange={(e) => setExecutionMode(e.target.value)}
                  className="w-full bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-1.5 py-1.5 focus:outline-none focus:border-accent-blue text-[11px]"
                >
                  <option value="conservative">Conservative</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="w-full flex items-center justify-center gap-2 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg shadow-sm transition-all"
          >
            {submitMutation.isPending ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Dispatching Simulation...
              </>
            ) : (
              <>
                <Play size={14} fill="currentColor" />
                Start Backtest Run
              </>
            )}
          </button>
        </div>

        {/* Right Column: Institutional Run History Workspace (8 cols) */}
        <div className="lg:col-span-8 bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3 flex flex-col justify-between">
          <div>
            {/* Header with Search and Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-border-primary">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Activity size={14} className="text-accent-green" />
                Historical Run History
              </span>

              <div className="flex items-center gap-2">
                {/* Search Filter */}
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="Search runs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-bg-tertiary border border-border-primary rounded px-2.5 py-1 pl-7 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue w-36 sm:w-48"
                  />
                </div>

                {/* Density Toggle */}
                <div className="flex items-center border border-border-primary rounded overflow-hidden text-[10px]">
                  <button
                    type="button"
                    onClick={() => setDensity('compact')}
                    className={`px-2 py-1 transition-colors ${
                      density === 'compact' ? 'bg-accent-blue text-white font-bold' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => setDensity('comfortable')}
                    className={`px-2 py-1 transition-colors ${
                      density === 'comfortable' ? 'bg-accent-blue text-white font-bold' : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Comfortable
                  </button>
                </div>

                {/* Refresh Button */}
                <button
                  type="button"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="p-1 rounded bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
                  title="Refresh runs"
                >
                  <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs text-left whitespace-nowrap font-mono">
                <thead className="bg-bg-tertiary text-text-secondary text-[10px] uppercase tracking-wider border-b border-border-primary">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Status</th>
                    <th className="py-2 px-3 font-semibold">Run ID</th>
                    <th className="py-2 px-3 font-semibold text-right">Trades</th>
                    <th className="py-2 px-3 font-semibold text-right">
                      Win % <span className="text-[8px] text-accent-green font-bold">FACT</span>
                    </th>
                    <th className="py-2 px-3 font-semibold text-right">
                      PF <span className="text-[8px] text-accent-blue font-bold">FACT</span>
                    </th>
                    <th className="py-2 px-3 font-semibold text-right">Sharpe</th>
                    <th className="py-2 px-3 font-semibold">Created</th>
                    <th className="py-2 px-3 font-semibold text-center">Workstation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary/60">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-text-tertiary">
                        <div className="flex flex-col items-center gap-2">
                          <RefreshCw size={18} className="animate-spin text-accent-blue" />
                          <span>Loading backtest runs...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRuns.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-text-tertiary">
                        No backtest runs found. Configure parameters on the left to initiate a simulation.
                      </td>
                    </tr>
                  ) : (
                    filteredRuns.map((r) => {
                      const st = (r.status || 'UNKNOWN').toLowerCase();
                      const statusBadge =
                        st === 'completed' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-green/10 text-accent-green border border-accent-green/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
                            COMPLETED
                          </span>
                        ) : st === 'running' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-blue/10 text-accent-blue border border-accent-blue/20 animate-pulse">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-ping" />
                            RUNNING
                          </span>
                        ) : st === 'queued' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-amber/10 text-accent-amber border border-accent-amber/20">
                            <Clock size={10} />
                            QUEUED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-red/10 text-accent-red border border-accent-red/20">
                            FAILED
                          </span>
                        );

                      const rowPad = density === 'compact' ? 'py-1.5 px-3' : 'py-2.5 px-3';

                      return (
                        <tr key={r.id} className="hover:bg-bg-tertiary/40 transition-colors">
                          <td className={rowPad}>{statusBadge}</td>
                          <td className={`${rowPad} text-text-primary font-bold`}>
                            <Link href={`/backtest/${r.id}`} className="hover:text-accent-blue transition-colors underline decoration-border-secondary">
                              {r.id.length > 16 ? `${r.id.slice(0, 16)}...` : r.id}
                            </Link>
                          </td>
                          <td className={`${rowPad} text-right font-bold text-text-primary`}>
                            {r._count?.trades ?? 0}
                          </td>
                          <td className={`${rowPad} text-right font-bold ${
                            r.metrics?.winRate && r.metrics.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'
                          }`}>
                            {r.metrics?.winRate !== undefined ? `${r.metrics.winRate.toFixed(1)}%` : '—'}
                          </td>
                          <td className={`${rowPad} text-right font-bold text-text-primary`}>
                            {r.metrics?.profitFactor !== undefined ? fmt(r.metrics.profitFactor) : '—'}
                          </td>
                          <td className={`${rowPad} text-right text-text-secondary`}>
                            {r.metrics?.sharpe !== undefined ? fmt(r.metrics.sharpe) : '—'}
                          </td>
                          <td className={`${rowPad} text-text-tertiary text-[11px]`}>
                            {formatIST(r.createdAt, { dateOnly: true })}
                          </td>
                          <td className={`${rowPad} text-center`}>
                            <div className="inline-flex items-center gap-2">
                              <Link
                                href={`/analytics/${r.id}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-accent-blue/10 text-accent-blue border border-accent-blue/20 hover:bg-accent-blue/20 transition-colors"
                              >
                                <BarChart3 size={11} />
                                Analytics
                              </Link>
                              <Link
                                href={`/backtest/${r.id}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary hover:bg-bg-tertiary/80 transition-colors"
                              >
                                <ExternalLink size={11} />
                                Details
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-2 border-t border-border-primary/60 text-[10px] text-text-tertiary flex justify-between items-center">
            <span>
              Showing {filteredRuns.length} of {runs.length} recorded runs
            </span>
            <span>All historical backtest metrics are strictly authoritative calculations.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
