'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo } from 'react';
import {
  PatternBreakoutReport,
  PatternType,
  BreakoutStatus,
} from '@/services/market-tools/pattern-breakout.service';

export default function PatternBreakoutPage() {
  const [report, setReport] = useState<PatternBreakoutReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<PatternType | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<BreakoutStatus | 'ALL'>('ALL');
  const [selectedTier, setSelectedTier] = useState<'A+' | 'A' | 'B' | 'C' | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pollForReport(attempt = 1, maxAttempts = 30) {
    if (attempt > maxAttempts) {
      setError('Pattern scan timed out. Please try refreshing again later.');
      setIsRefreshing(false);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/market-tools/pattern-breakout');
      const json = await res.json();

      if (res.status === 202 || json.status === 'processing') {
        setTimeout(() => pollForReport(attempt + 1, maxAttempts), 3000);
        return;
      }

      if (json.success && json.data) {
        setReport(json.data);
        setIsRefreshing(false);
        setLoading(false);
      } else {
        setError(json.error || 'Background pattern scan failed');
        setIsRefreshing(false);
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsRefreshing(false);
      setLoading(false);
    }
  }

  async function fetchReport(forceRefresh = false) {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else if (!report) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`/api/market-tools/pattern-breakout${forceRefresh ? '?refresh=true' : ''}`);
      const json = await res.json();

      if (res.status === 202 || json.status === 'processing') {
        pollForReport(1, 30);
        return;
      }

      if (json.success && json.data) {
        setReport(json.data);
      } else {
        setError(json.error || 'Failed to fetch pattern breakout report');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!forceRefresh) {
        setLoading(false);
      }
    }
  }

  const sectors = useMemo(() => {
    if (!report) return [];
    const set = new Set<string>();
    report.stocks.forEach((s) => set.add(s.sector));
    return ['ALL', ...Array.from(set).sort()];
  }, [report]);

  const filteredStocks = useMemo(() => {
    if (!report) return [];
    return report.stocks.filter((stock) => {
      // Pattern filter
      if (selectedPattern !== 'ALL' && stock.primaryPattern !== selectedPattern) return false;

      // Status filter
      if (selectedStatus !== 'ALL' && stock.status !== selectedStatus) return false;

      // Tier filter
      if (selectedTier !== 'ALL' && stock.scoreBreakdown.qualityTier !== selectedTier) return false;

      // Sector filter
      if (selectedSector !== 'ALL' && stock.sector !== selectedSector) return false;

      // Search query filter
      if (
        searchQuery &&
        !stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !stock.sector.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [report, selectedPattern, selectedStatus, selectedTier, selectedSector, searchQuery]);

  if (loading && !report) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-8 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400 font-medium">Scanning 52W High Patterns (Cup &amp; Handle, VCP, Flat Base, Double Bottom)...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-8 flex items-center justify-center">
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-6 max-w-md text-center space-y-4">
          <h2 className="text-xl font-bold text-red-400">Error Loading Pattern Scanner</h2>
          <p className="text-gray-300 text-sm">{error}</p>
          <button
            onClick={() => fetchReport(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg text-sm transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="min-h-screen bg-[#090a0f] text-gray-100 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span className="text-amber-400">⚡</span> 52W High Pattern Breakouts
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded uppercase">
              O&apos;Neil &amp; Minervini Engine
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Detects stocks at or near 52-week highs with classical institutional chart patterns (VCP, Cup &amp; Handle, Flat Base, Double Bottom) and 20D Volume confirmation.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <span className="text-xs font-mono text-gray-400 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">
            Date: <strong className="text-white">{report.date}</strong>
          </span>
          <button
            onClick={() => fetchReport(true)}
            disabled={loading || isRefreshing}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
          >
            <span className={loading || isRefreshing ? 'animate-spin' : ''}>🔄</span> {isRefreshing ? 'Scanning...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4 space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total Scanned</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-white">{report.totalScanned}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
              EQ Series
            </span>
          </div>
          <p className="text-[10px] text-gray-500">History Depth: {report.tradingDaysAvailable} days</p>
        </div>

        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4 space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Breakout Candidates</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-400">{report.countsByStatus.BREAKOUT}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800">
              At / Above 52W
            </span>
          </div>
          <p className="text-[10px] text-gray-500">Close ≥ 52W High (1 PRECEDING)</p>
        </div>

        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4 space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Near 52W High</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-400">{report.countsByStatus.NEAR_HIGH}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
              Within -5.0%
            </span>
          </div>
          <p className="text-[10px] text-gray-500">Consolidating below 52W pivot</p>
        </div>

        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4 space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">A+ Setups (Score 85+)</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-purple-400">{report.countsByTier['A+']}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800">
              Pattern + RVOL
            </span>
          </div>
          <p className="text-[10px] text-gray-500">High-conviction setups</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-3">
          {/* Pattern Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedPattern('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedPattern === 'ALL' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              All Patterns ({report.stocks.length})
            </button>
            <button
              onClick={() => setSelectedPattern('VCP')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedPattern === 'VCP' ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              VCP ({report.countsByPattern.VCP})
            </button>
            <button
              onClick={() => setSelectedPattern('CUP_AND_HANDLE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedPattern === 'CUP_AND_HANDLE' ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              Cup &amp; Handle ({report.countsByPattern.CUP_AND_HANDLE})
            </button>
            <button
              onClick={() => setSelectedPattern('FLAT_BASE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedPattern === 'FLAT_BASE' ? 'bg-amber-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              Flat Base ({report.countsByPattern.FLAT_BASE})
            </button>
            <button
              onClick={() => setSelectedPattern('DOUBLE_BOTTOM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedPattern === 'DOUBLE_BOTTOM' ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              Double Bottom ({report.countsByPattern.DOUBLE_BOTTOM})
            </button>
            <button
              onClick={() => setSelectedPattern('NONE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedPattern === 'NONE' ? 'bg-slate-700 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              Raw 52W High ({report.countsByPattern.NONE})
            </button>
          </div>

          {/* Search and Secondary Dropdowns */}
          <div className="flex items-center gap-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as BreakoutStatus | 'ALL')}
              className="px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="BREAKOUT">Breakout (≥ 52W)</option>
              <option value="NEAR_HIGH">Near High (-5% to 0%)</option>
            </select>

            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value as 'A+' | 'A' | 'B' | 'C' | 'ALL')}
              className="px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Tiers</option>
              <option value="A+">Tier A+ (85+)</option>
              <option value="A">Tier A (70-84)</option>
              <option value="B">Tier B (50-69)</option>
            </select>

            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            >
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All Sectors' : s}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Search symbol / sector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 w-44"
            />
          </div>
        </div>
      </div>

      {/* Main Pattern Table */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 uppercase font-semibold bg-gray-950/60 select-none">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Symbol</th>
                <th className="py-3 px-4">Sector</th>
                <th className="py-3 px-4 text-right">CMP (₹)</th>
                <th className="py-3 px-4 text-right">Day Chg</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">52W High (₹)</th>
                <th className="py-3 px-4 text-right">Dist to 52W</th>
                <th className="py-3 px-4 text-center">Primary Pattern</th>
                <th className="py-3 px-4 text-right">RVOL 20D</th>
                <th className="py-3 px-4 text-center">Score</th>
                <th className="py-3 px-4 text-center">Tier</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-gray-500">
                    No stocks match the selected pattern, status, or search filters.
                  </td>
                </tr>
              ) : (
                filteredStocks.map((stock, idx) => {
                  const isExpanded = expandedSymbol === stock.symbol;
                  return (
                    <React.Fragment key={stock.symbol}>
                      <tr className="hover:bg-gray-800/40 transition group">
                        <td className="py-3 px-4 text-gray-500 font-mono">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-white tracking-wide">
                          {stock.symbol}
                        </td>
                        <td className="py-3 px-4 text-gray-400">{stock.sector}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-gray-100">
                          ₹{stock.close.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold ${
                            stock.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {stock.changePct >= 0 ? `+${stock.changePct}%` : `${stock.changePct}%`}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider border ${
                              stock.status === 'BREAKOUT'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                                : 'bg-amber-950 text-amber-300 border-amber-700'
                            }`}
                          >
                            {stock.status === 'BREAKOUT' ? 'BREAKOUT' : 'NEAR HIGH'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-gray-300">
                          ₹{stock.high52w.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold ${
                            stock.distanceToHighPct >= 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {stock.distanceToHighPct >= 0
                            ? `+${stock.distanceToHighPct}%`
                            : `${stock.distanceToHighPct}%`}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-1 rounded text-[10px] font-bold whitespace-nowrap border ${getPatternBadgeStyle(
                              stock.primaryPattern
                            )}`}
                          >
                            {stock.primaryPatternLabel}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {stock.rvol20d !== null ? (
                            <span
                              className={`font-bold ${
                                stock.rvol20d >= 2.0
                                  ? 'text-emerald-400'
                                  : stock.rvol20d >= 1.2
                                  ? 'text-blue-400'
                                  : 'text-gray-400'
                              }`}
                            >
                              {stock.rvol20d}x
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-black text-white">
                          {stock.scoreBreakdown.totalScore}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black border ${getTierBadgeStyle(
                              stock.scoreBreakdown.qualityTier
                            )}`}
                          >
                            {stock.scoreBreakdown.qualityTier}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setExpandedSymbol(isExpanded ? null : stock.symbol)}
                            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] font-semibold transition"
                          >
                            {isExpanded ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Row Detail */}
                      {isExpanded && (
                        <tr className="bg-gray-950/90 border-b border-gray-800">
                          <td colSpan={13} className="p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Pattern Details */}
                              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                                  Pattern Structural Breakdown
                                </h4>
                                {stock.patternDetails ? (
                                  <div className="space-y-1 text-xs">
                                    <p className="text-gray-200">
                                      <strong>Pattern:</strong> {stock.primaryPatternLabel}
                                    </p>
                                    <p className="text-gray-300">{stock.patternDetails.description}</p>
                                    <div className="flex gap-4 text-gray-400 font-mono text-[11px] pt-1">
                                      <span>Base Depth: {stock.patternDetails.baseDepthPct}%</span>
                                      <span>Duration: {stock.patternDetails.baseDays} days</span>
                                      <span>Confidence: {stock.patternDetails.confidence}%</span>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-500">
                                    No classical consolidation base detected. This is a momentum price breakout into 52W High territory.
                                  </p>
                                )}
                              </div>

                              {/* Score Breakdown */}
                              <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 space-y-2">
                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                                  Score Component Breakdown (Total: {stock.scoreBreakdown.totalScore} / 100)
                                </h4>
                                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                                  <div className="bg-gray-950 p-2 rounded border border-gray-800">
                                    <div className="text-gray-500 text-[10px]">52W Proximity</div>
                                    <div className="text-white font-bold font-mono">
                                      {stock.scoreBreakdown.proximityScore} / 30
                                    </div>
                                  </div>
                                  <div className="bg-gray-950 p-2 rounded border border-gray-800">
                                    <div className="text-gray-500 text-[10px]">Volume RVOL</div>
                                    <div className="text-white font-bold font-mono">
                                      {stock.scoreBreakdown.volumeScore} / 25
                                    </div>
                                  </div>
                                  <div className="bg-gray-950 p-2 rounded border border-gray-800">
                                    <div className="text-gray-500 text-[10px]">Pattern Quality</div>
                                    <div className="text-white font-bold font-mono">
                                      {stock.scoreBreakdown.patternScore} / 25
                                    </div>
                                  </div>
                                  <div className="bg-gray-950 p-2 rounded border border-gray-800">
                                    <div className="text-gray-500 text-[10px]">Momentum/MA</div>
                                    <div className="text-white font-bold font-mono">
                                      {stock.scoreBreakdown.momentumScore} / 20
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function getPatternBadgeStyle(pattern: PatternType): string {
  switch (pattern) {
    case 'VCP':
      return 'bg-indigo-950 text-indigo-300 border-indigo-700';
    case 'CUP_AND_HANDLE':
      return 'bg-emerald-950 text-emerald-300 border-emerald-700';
    case 'FLAT_BASE':
      return 'bg-amber-950 text-amber-300 border-amber-700';
    case 'DOUBLE_BOTTOM':
      return 'bg-purple-950 text-purple-300 border-purple-700';
    default:
      return 'bg-gray-800 text-gray-400 border-gray-700';
  }
}

function getTierBadgeStyle(tier: 'A+' | 'A' | 'B' | 'C'): string {
  switch (tier) {
    case 'A+':
      return 'bg-emerald-950 text-emerald-300 border-emerald-700';
    case 'A':
      return 'bg-blue-950 text-blue-300 border-blue-700';
    case 'B':
      return 'bg-amber-950 text-amber-300 border-amber-700';
    default:
      return 'bg-gray-800 text-gray-400 border-gray-700';
  }
}
