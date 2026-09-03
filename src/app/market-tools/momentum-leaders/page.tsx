'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  MomentumLeadersReport,
  MomentumTier,
  MomentumUniverse,
} from '@/services/market-tools/momentum-leaders.service';
import { BreakoutVpaStatus } from '@/services/vpa/vpa.math';
import { ExportActions } from '@/components/market-tools/ExportActions';
import { generateCsvContent, downloadFile } from '@/lib/export-utils';
import {
  RefreshCw,
  Search,
  Flame,
  Award,
  ShieldCheck,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-react';

export default function MomentumLeadersPage() {
  const [report, setReport] = useState<MomentumLeadersReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedUniverse, setSelectedUniverse] = useState<MomentumUniverse>('NSE_FNO');
  const [selectedTier, setSelectedTier] = useState<MomentumTier | 'ALL'>('ALL');
  const [selectedWindows, setSelectedWindows] = useState<'ALL' | '4' | '3' | '2'>('ALL');
  const [selectedVpa, setSelectedVpa] = useState<BreakoutVpaStatus | 'ALL'>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const isMounted = useRef(true);
  const refreshControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMounted.current = true;
    const abortController = new AbortController();
    fetchReport(false, selectedUniverse, abortController.signal);
    return () => {
      isMounted.current = false;
      abortController.abort();
      if (refreshControllerRef.current) {
        refreshControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchReport = async (forceRefresh = false, universe = selectedUniverse, signal?: AbortSignal) => {
    if (forceRefresh) {
      setIsRefreshing(true);
      if (refreshControllerRef.current) {
        refreshControllerRef.current.abort();
      }
      const controller = new AbortController();
      refreshControllerRef.current = controller;
      signal = controller.signal;
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const url = forceRefresh
        ? `/api/market-tools/momentum-leaders?universe=${universe}&refresh=true`
        : `/api/market-tools/momentum-leaders?universe=${universe}`;
      const res = await fetch(url, signal ? { signal } : {});
      if (!res.ok) {
        if (res.status === 401 && forceRefresh) {
          throw new Error('Please sign in to trigger a full recalculation scan.');
        }
        throw new Error(`Failed to load momentum leaders report (${res.status})`);
      }
      const json = await res.json();
      if (json.success && isMounted.current) {
        setReport(json.data);
      } else if (isMounted.current) {
        throw new Error(json.error || 'Failed to parse response');
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  const handleUniverseChange = (universe: MomentumUniverse) => {
    if (universe === selectedUniverse) return;
    setSelectedUniverse(universe);
    fetchReport(false, universe);
  };

  // Extract unique sectors
  const sectors = useMemo(() => {
    if (!report) return [];
    const set = new Set<string>();
    report.allStocks.forEach(s => {
      if (s.sector && s.sector !== 'Unknown') set.add(s.sector);
    });
    return Array.from(set).sort();
  }, [report]);

  // Filtered stocks
  const filteredStocks = useMemo(() => {
    if (!report) return [];
    return report.allStocks.filter(stock => {
      if (selectedTier !== 'ALL' && stock.tier !== selectedTier) return false;
      if (selectedWindows === '4' && stock.leaderWindowCount !== 4) return false;
      if (selectedWindows === '3' && stock.leaderWindowCount < 3) return false;
      if (selectedWindows === '2' && stock.leaderWindowCount < 2) return false;
      if (selectedVpa !== 'ALL' && stock.vpaFootprint.status !== selectedVpa) return false;
      if (selectedSector !== 'ALL' && stock.sector !== selectedSector) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSym = stock.symbol.toLowerCase().includes(q);
        const matchesSec = stock.sector.toLowerCase().includes(q);
        if (!matchesSym && !matchesSec) return false;
      }

      return true;
    });
  }, [report, selectedTier, selectedWindows, selectedVpa, selectedSector, searchQuery]);

  // CSV Export handler
  const handleExportCsv = () => {
    if (!filteredStocks.length) return;
    const headers = [
      'Symbol',
      'Sector',
      'LTP',
      '1D Change %',
      'Circuit Lock',
      'Composite Score',
      'Tier',
      'Leader Windows',
      '1D Return %',
      '1D Rank',
      '5D Return %',
      '5D Rank',
      '10D Return %',
      '10D Rank',
      '21D Return %',
      '21D Rank',
      'VPA Status',
      'RVOL 20D',
      'CLV',
      'Turnover (Cr)',
      '20D Avg Turnover (Cr)',
    ];
    const rows = filteredStocks.map(s => [
      s.symbol,
      s.sector,
      s.close.toFixed(2),
      s.changePct.toFixed(2) + '%',
      s.isCircuitLocked ? `${s.changePct >= 0 ? 'Limit Up' : 'Limit Down'} (${s.circuitLimitPct}%)` : 'No',
      s.compositeScore,
      s.tier,
      `${s.leaderWindowCount}/4`,
      s.windows.w1d.returnPct.toFixed(2) + '%',
      s.windows.w1d.rank,
      s.windows.w5d.returnPct.toFixed(2) + '%',
      s.windows.w5d.rank,
      s.windows.w10d.returnPct.toFixed(2) + '%',
      s.windows.w10d.rank,
      s.windows.w21d.returnPct.toFixed(2) + '%',
      s.windows.w21d.rank,
      s.vpaFootprint.label,
      s.rvol20d !== null ? s.rvol20d.toFixed(2) + 'x' : 'N/A',
      s.clv !== null ? s.clv.toFixed(2) : 'N/A',
      s.turnoverCr.toFixed(1),
      s.avgTurnoverCr20d !== undefined ? s.avgTurnoverCr20d.toFixed(1) : 'N/A',
    ]);

    const csvContent = generateCsvContent(headers, rows);
    const dateStr = report?.date || new Date().toISOString().slice(0, 10);
    downloadFile(csvContent, `momentum-leaders-${selectedUniverse.toLowerCase()}-${dateStr}.csv`, 'text/csv');
  };

  const getTierBadge = (tier: MomentumTier) => {
    switch (tier) {
      case 'A+':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'A':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'B':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  const getVpaBadge = (status: BreakoutVpaStatus) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'ABSORPTION':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      case 'NO_DEMAND':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'CLIMAX_REJECT':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <Flame size={22} className="animate-pulse" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Multi-Window Momentum Leaders
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 font-semibold">
                    NSE F&amp;O
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Surfacing persistent momentum across multiple time horizons (1D, 5D, 10D, 21D) with institutional VPA confirmation
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {report && (
              <ExportActions
                onExportCsv={handleExportCsv}
                disabled={filteredStocks.length === 0}
              />
            )}
            <button
              onClick={() => fetchReport(true)}
              disabled={isRefreshing || loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-200 hover:bg-slate-800 transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Scanning...' : 'Recalculate'}</span>
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => fetchReport(false)} className="underline hover:text-rose-200">
              Retry
            </button>
          </div>
        )}

        {/* Universe Selector Tabs (Mirroring Market Breadth) */}
        {report && (
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
            <button
              onClick={() => handleUniverseChange('NSE_FNO')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                selectedUniverse === 'NSE_FNO'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800/80'
              }`}
            >
              F&amp;O Universe {report.universe === 'NSE_FNO' ? `(${report.qualifiedCount})` : ''}
            </button>
            <button
              onClick={() => handleUniverseChange('ALL_NSE')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                selectedUniverse === 'ALL_NSE'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800/80'
              }`}
            >
              ALL NSE (&ge; ₹10Cr) {report.universe === 'ALL_NSE' ? `(${report.qualifiedCount})` : ''}
            </button>
          </div>
        )}

        {/* Metric Cards */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-xs font-medium text-slate-400">Total Scanned</div>
              <div className="text-2xl font-bold text-white mt-1">
                {report.qualifiedCount} <span className="text-xs font-normal text-slate-400">/ {report.totalScanned}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">As of {report.date}</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                <Award size={13} /> Tier A+ Leaders
              </div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                {report.countsByTier['A+']}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Score &ge; 90 (Elite momentum)</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-xs font-medium text-orange-400 flex items-center gap-1">
                <Flame size={13} /> 4-Window Leaders
              </div>
              <div className="text-2xl font-bold text-orange-400 mt-1">
                {report.countsByLeaderWindows['4_windows']}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Top 15% across all 4 frames</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="text-xs font-medium text-blue-400 flex items-center gap-1">
                <Zap size={13} /> 3+ Window Leaders
              </div>
              <div className="text-2xl font-bold text-blue-400 mt-1">
                {report.countsByLeaderWindows['4_windows'] + report.countsByLeaderWindows['3_windows']}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Multi-week persistent trend</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 col-span-2 sm:col-span-1">
              <div className="text-xs font-medium text-purple-400 flex items-center gap-1">
                <ShieldCheck size={13} /> Volume Confirmed
              </div>
              <div className="text-2xl font-bold text-purple-400 mt-1">
                {report.allStocks.filter(s => s.vpaFootprint.status === 'CONFIRMED').length}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">RVOL &ge; 1.5x + Close on High</div>
            </div>
          </div>
        )}

        {/* Filters and Controls */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Window buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 mr-1">Windows:</span>
              <button
                onClick={() => setSelectedWindows('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedWindows === 'ALL'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSelectedWindows('4')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedWindows === '4'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                🔥 4/4 Windows ({report?.countsByLeaderWindows['4_windows'] ?? 0})
              </button>
              <button
                onClick={() => setSelectedWindows('3')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedWindows === '3'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                3+ Windows ({((report?.countsByLeaderWindows['4_windows'] ?? 0) + (report?.countsByLeaderWindows['3_windows'] ?? 0))})
              </button>
              <button
                onClick={() => setSelectedWindows('2')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedWindows === '2'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                2+ Windows
              </button>
            </div>

            {/* Quality Tier buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 mr-1">Tier:</span>
              <button
                onClick={() => setSelectedTier('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedTier === 'ALL'
                    ? 'bg-slate-200 text-slate-900 font-semibold'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSelectedTier('A+')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedTier === 'A+'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                A+ ({report?.countsByTier['A+'] ?? 0})
              </button>
              <button
                onClick={() => setSelectedTier('A')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedTier === 'A'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                A ({report?.countsByTier['A'] ?? 0})
              </button>
              <button
                onClick={() => setSelectedTier('B')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedTier === 'B'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                B ({report?.countsByTier['B'] ?? 0})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/50">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search symbol or sector..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* VPA Filter */}
            <select
              value={selectedVpa}
              onChange={e => setSelectedVpa(e.target.value as BreakoutVpaStatus | 'ALL')}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">All VPA Footprints</option>
              <option value="CONFIRMED">Volume Confirmed</option>
              <option value="ABSORPTION">Supply Absorption</option>
              <option value="NO_DEMAND">Low Volume (No Demand)</option>
              <option value="CLIMAX_REJECT">Upper Wick Trap</option>
              <option value="NEUTRAL">Neutral</option>
            </select>

            {/* Sector Filter */}
            <select
              value={selectedSector}
              onChange={e => setSelectedSector(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">All Sectors ({sectors.length})</option>
              {sectors.map(sec => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 overflow-hidden shadow-lg">
          {loading ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <RefreshCw size={24} className="animate-spin mx-auto text-orange-400" />
              <p className="text-xs">Computing multi-window momentum percentiles and VPA footprints...</p>
            </div>
          ) : filteredStocks.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <p className="text-sm font-semibold">No momentum leaders found matching current filters</p>
              <p className="text-xs text-slate-400">Try broadening your window or tier selection.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold">
                  <tr>
                    <th className="py-3 px-3.5">Rank &amp; Symbol</th>
                    <th className="py-3 px-3 text-right">LTP / 1D %</th>
                    <th className="py-3 px-3 text-center">Consistency</th>
                    <th className="py-3 px-3 text-center">1D Window</th>
                    <th className="py-3 px-3 text-center">5D (~1W)</th>
                    <th className="py-3 px-3 text-center">10D (~2W)</th>
                    <th className="py-3 px-3 text-center">21D (~1M)</th>
                    <th className="py-3 px-3">VPA Footprint</th>
                    <th className="py-3 px-3 text-right">RVOL</th>
                    <th className="py-3 px-3 text-right">Turnover</th>
                    <th className="py-3 px-3.5 text-center">Momentum Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredStocks.map((stock, idx) => {
                    const isExpanded = expandedSymbol === stock.symbol;

                    return (
                      <React.Fragment key={stock.symbol}>
                        <tr
                          onClick={() => setExpandedSymbol(isExpanded ? null : stock.symbol)}
                          className={`hover:bg-slate-800/40 transition cursor-pointer ${
                            isExpanded ? 'bg-slate-800/30' : ''
                          }`}
                        >
                          {/* Symbol & Sector */}
                          <td className="py-3 px-3.5 font-medium text-white">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 text-[11px] font-mono w-5">
                                #{idx + 1}
                              </span>
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold tracking-tight text-white hover:text-orange-400 transition">
                                    {stock.symbol}
                                  </span>
                                  {stock.isCircuitLocked && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                      title={`Stock 1D return (${stock.changePct >= 0 ? '+' : ''}${stock.changePct.toFixed(2)}%) is within ±0.20% of the ${stock.circuitLimitPct}% circuit limit. Likely circuit-locked (untradeable at market).`}
                                    >
                                      <Lock size={10} className="text-amber-400 flex-shrink-0" />
                                      {stock.changePct >= 0 ? 'Limit Up' : 'Limit Down'} ({stock.circuitLimitPct}%)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400">{stock.sector}</div>
                              </div>
                            </div>
                          </td>

                          {/* LTP / Change */}
                          <td className="py-3 px-3 text-right font-mono">
                            <div className="text-slate-100 font-semibold">₹{stock.close.toFixed(2)}</div>
                            <div
                              className={`text-[11px] font-medium ${
                                stock.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {stock.changePct >= 0 ? '+' : ''}
                              {stock.changePct.toFixed(2)}%
                            </div>
                          </td>

                          {/* Multi-Window Consistency Badge */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                stock.leaderWindowCount === 4
                                  ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                                  : stock.leaderWindowCount === 3
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : stock.leaderWindowCount === 2
                                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {stock.leaderWindowCount === 4 && <Flame size={10} />}
                              {stock.leaderWindowCount}/4 Lead
                            </span>
                          </td>

                          {/* 1D Window */}
                          <td className="py-3 px-3 text-center font-mono">
                            <div
                              className={`font-semibold ${
                                stock.windows.w1d.isLeader
                                  ? 'text-emerald-400 font-bold'
                                  : 'text-slate-300'
                              }`}
                            >
                              {stock.windows.w1d.returnPct >= 0 ? '+' : ''}
                              {stock.windows.w1d.returnPct.toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Top {stock.windows.w1d.percentile.toFixed(0)}% (#{stock.windows.w1d.rank})
                            </div>
                          </td>

                          {/* 5D Window */}
                          <td className="py-3 px-3 text-center font-mono">
                            <div
                              className={`font-semibold ${
                                stock.windows.w5d.isLeader
                                  ? 'text-emerald-400 font-bold'
                                  : 'text-slate-300'
                              }`}
                            >
                              {stock.windows.w5d.returnPct >= 0 ? '+' : ''}
                              {stock.windows.w5d.returnPct.toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Top {stock.windows.w5d.percentile.toFixed(0)}% (#{stock.windows.w5d.rank})
                            </div>
                          </td>

                          {/* 10D Window */}
                          <td className="py-3 px-3 text-center font-mono">
                            <div
                              className={`font-semibold ${
                                stock.windows.w10d.isLeader
                                  ? 'text-emerald-400 font-bold'
                                  : 'text-slate-300'
                              }`}
                            >
                              {stock.windows.w10d.returnPct >= 0 ? '+' : ''}
                              {stock.windows.w10d.returnPct.toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Top {stock.windows.w10d.percentile.toFixed(0)}% (#{stock.windows.w10d.rank})
                            </div>
                          </td>

                          {/* 21D Window */}
                          <td className="py-3 px-3 text-center font-mono">
                            <div
                              className={`font-semibold ${
                                stock.windows.w21d.isLeader
                                  ? 'text-emerald-400 font-bold'
                                  : 'text-slate-300'
                              }`}
                            >
                              {stock.windows.w21d.returnPct >= 0 ? '+' : ''}
                              {stock.windows.w21d.returnPct.toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Top {stock.windows.w21d.percentile.toFixed(0)}% (#{stock.windows.w21d.rank})
                            </div>
                          </td>

                          {/* VPA Footprint */}
                          <td className="py-3 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${getVpaBadge(
                                stock.vpaFootprint.status
                              )}`}
                            >
                              {stock.vpaFootprint.label}
                            </span>
                          </td>

                          {/* RVOL */}
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {stock.rvol20d !== null ? `${stock.rvol20d.toFixed(1)}x` : '—'}
                          </td>

                          {/* Turnover */}
                          <td className="py-3 px-3 text-right font-mono text-slate-400">
                            ₹{stock.turnoverCr.toFixed(1)}Cr
                          </td>

                          {/* Score & Tier */}
                          <td className="py-3 px-3.5 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-bold border ${getTierBadge(
                                  stock.tier
                                )}`}
                              >
                                {stock.compositeScore}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">
                                {stock.tier}
                              </span>
                              {isExpanded ? (
                                <ChevronUp size={12} className="text-slate-400" />
                              ) : (
                                <ChevronDown size={12} className="text-slate-400" />
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Mathematical Breakdown */}
                        {isExpanded && (
                          <tr className="bg-slate-900/90 border-b border-slate-800">
                            <td colSpan={11} className="p-4 sm:p-5">
                              <div className="max-w-4xl mx-auto space-y-4 text-xs">
                                <div className="flex items-center gap-2 text-orange-400 font-semibold">
                                  <Info size={14} />
                                  <span>Momentum Score Audit for {stock.symbol}</span>
                                </div>

                                {stock.isCircuitLocked && (
                                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[11px] text-amber-300 flex items-center gap-2.5">
                                    <Lock size={15} className="text-amber-400 flex-shrink-0" />
                                    <span>
                                      <strong>Circuit Lock Warning:</strong> 1D return of {stock.changePct >= 0 ? '+' : ''}{stock.changePct.toFixed(2)}% is within &plusmn;0.20% of the {stock.circuitLimitPct}% price band. In cash equities, circuit-locked stocks typically cannot be entered or exited at market prices due to lack of sellers/buyers.
                                    </span>
                                  </div>
                                )}

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                                  <div>
                                    <div className="text-slate-400 text-[11px]">Base Weighted Momentum</div>
                                    <div className="font-mono font-bold text-white text-sm mt-0.5">
                                      {stock.baseScore.toFixed(2)} pts
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      0.85 &times; (0.15&middot;1D + 0.25&middot;5D + 0.30&middot;10D + 0.30&middot;21D)
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-slate-400 text-[11px]">Consistency Bonus</div>
                                    <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                                      +{stock.consistencyBonus.toFixed(2)} pts
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      +2.5 pts &times; {stock.leaderWindowCount} windows in Top 15%
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-slate-400 text-[11px]">Dispersion Penalty</div>
                                    <div className="font-mono font-bold text-rose-400 text-sm mt-0.5">
                                      -{stock.dispersionPenalty.toFixed(2)} pts
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      -0.10 &times; sample_std across windows
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-slate-400 text-[11px]">VPA Volume Modifier</div>
                                    <div
                                      className={`font-mono font-bold text-sm mt-0.5 ${
                                        stock.vpaModifier >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                      }`}
                                    >
                                      {stock.vpaModifier >= 0 ? '+' : ''}
                                      {stock.vpaModifier} pts
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      {stock.vpaFootprint.label} ({stock.vpaFootprint.description})
                                    </div>
                                  </div>
                                </div>

                                <div className="text-[11px] text-slate-400">
                                  <strong>Final Formula:</strong> min(100, max(0, round({stock.baseScore} + {stock.consistencyBonus} - {stock.dispersionPenalty} + {stock.vpaModifier}))) = <strong className="text-white">{stock.compositeScore} / 100</strong> (Tier {stock.tier})
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
