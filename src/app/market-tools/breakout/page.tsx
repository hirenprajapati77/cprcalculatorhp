'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ExportActions } from '@/components/market-tools/ExportActions';
import { generateCsvContent, downloadFile } from '@/lib/export-utils';
import {
  MultiYearBreakoutReport,
  BreakoutStock,
  BreakoutWindow,
} from '@/services/market-tools/multi-year-breakout.service';

export default function MultiYearBreakoutPage() {
  const [report, setReport] = useState<MultiYearBreakoutReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<BreakoutWindow | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');
  // B16b: track mounted state to prevent setState on unmounted component
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const controller = new AbortController();
    fetchBreakouts(false, controller.signal);
    return () => {
      isMounted.current = false;
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchBreakouts(forceRefresh = false, signal?: AbortSignal) {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/market-tools/breakout${forceRefresh ? '?refresh=true' : ''}`,
        signal ? { signal } : {}
      );
      const json = await res.json();
      if (!isMounted.current) return;
      if (json.success) {
        setReport(json.data);
      } else {
        setError(json.error || 'Failed to fetch breakout report');
      }
    } catch (err) {
      if (!isMounted.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRefreshing(false);
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
      // Window filter
      if (selectedWindow === '1Y' && stock.breakout1Y !== true) return false;
      if (selectedWindow === '2Y' && stock.breakout2Y !== true) return false;
      if (selectedWindow === '3Y' && stock.breakout3Y !== true) return false;
      if (selectedWindow === '5Y' && stock.breakout5Y !== true) return false;
      if (selectedWindow === '10Y' && stock.breakout10Y !== true) return false;
      if (selectedWindow === 'ATH' && stock.breakoutATH !== true) return false;

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
  }, [report, selectedWindow, selectedSector, searchQuery]);

  if (loading && !report) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-8 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400 font-medium">Scanning 2,600+ symbols for Multi-Year Breakouts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-8 flex items-center justify-center">
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-6 max-w-md text-center space-y-4">
          <h2 className="text-xl font-bold text-red-400">Error Loading Breakout Scanner</h2>
          <p className="text-gray-300 text-sm">{error}</p>
          <button
            onClick={() => fetchBreakouts(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg text-sm transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const handleExportCsv = () => {
    if (!report) return;
    const headers = [
      '#',
      'Symbol',
      'Sector',
      'CMP (INR)',
      'Day Change %',
      'Strongest Breakout',
      'VPA Footprint',
      'CLV',
      'RVOL 20D',
      'Breakout Reference Price (INR)',
      'Gain over Breakout %',
      '1Y Breakout',
      '2Y Breakout',
      '3Y Breakout',
      '5Y Breakout',
      '10Y Breakout',
      'ATH Breakout',
      'Volume',
      'History Days',
    ];
    const rows = filteredStocks.map((s, idx) => [
      idx + 1,
      s.symbol,
      s.sector,
      s.close,
      s.changePct,
      s.strongestBreakout ?? '',
      s.vpaFootprint?.label ?? 'Standard',
      s.clv !== null ? s.clv : '',
      s.rvol20d !== null ? s.rvol20d : '',
      s.breakoutPrice !== null ? s.breakoutPrice : '',
      s.breakoutGainPct !== null ? s.breakoutGainPct : '',
      s.breakout1Y === true ? 'YES' : s.breakout1Y === false ? 'NO' : 'N/A',
      s.breakout2Y === true ? 'YES' : s.breakout2Y === false ? 'NO' : 'N/A',
      s.breakout3Y === true ? 'YES' : s.breakout3Y === false ? 'NO' : 'N/A',
      s.breakout5Y === true ? 'YES' : s.breakout5Y === false ? 'NO' : 'N/A',
      s.breakout10Y === true ? 'YES' : s.breakout10Y === false ? 'NO' : 'N/A',
      s.breakoutATH === true ? 'YES' : s.breakoutATH === false ? 'NO' : 'N/A',
      s.volume,
      s.historyDays,
    ]);
    const csvContent = generateCsvContent(headers, rows);
    const dateStr = report.date || new Date().toISOString().split('T')[0];
    downloadFile(csvContent, `multi_year_breakout_${dateStr}.csv`);
  };

  if (!report) return null;

  const isSelectedWindowUnavailable =
    selectedWindow !== 'ALL' && !report.windowAvailability[selectedWindow]?.available;

  return (
    <div className="w-full min-w-0 space-y-8">
      {/* Header */}
      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-xs font-semibold text-blue-300 animate-pulse">
          <span className="inline-block animate-spin">🔄</span>
          Scanning 2,600+ NSE symbols across 1Y/2Y/3Y/5Y/10Y/ATH breakout windows... Please wait.
        </div>
      )}
      {!isRefreshing && report.status === 'pending' && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-300">
          <span>⏳</span>
          Not yet computed for today — the 19:15 IST precompute job hasn&apos;t run yet, or the cache is cold after a restart. Click Refresh to scan now.
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Multi-Year Breakout Scanner</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50">
              {report.date}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Detecting stocks breaking out to new highs over 1Y/2Y/3Y/5Y/10Y and All-Time-High (ATH) windows across{' '}
            {report.totalScanned} symbols.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <ExportActions onExportCsv={handleExportCsv} disabled={filteredStocks.length === 0} />
          <button
            onClick={() => fetchBreakouts(true)}
            disabled={loading || isRefreshing}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition flex items-center gap-2 shadow-sm"
          >
            <span className={loading || isRefreshing ? 'inline-block animate-spin' : ''}>🔄</span>
            {isRefreshing ? 'Scanning...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Top Cards: Summary & Depth Guard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: 1Y Breakouts */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-5 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">1-Year Breakouts</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-400">{report.breakoutCounts['1Y']}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              250-Day Window
            </span>
          </div>
          <p className="text-[11px] text-gray-500">Closing above 250-day trailing high</p>
        </div>

        {/* Card 2: ATH Breakouts */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-5 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">All-Time-High (ATH)</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-indigo-400">{report.breakoutCounts['ATH']}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
              Available History
            </span>
          </div>
          <p className="text-[11px] text-gray-500">Closing at highest level in dataset</p>
        </div>

        {/* Card 3: 2Y–10Y Multi-Year Status */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-5 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">2Y – 10Y Windows</span>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-amber-400">Accumulating Data</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
              {report.tradingDaysAvailable} / 500+ Days
            </span>
          </div>
          <p className="text-[11px] text-gray-500">Strict depth guards prevent false metrics</p>
        </div>

        {/* Card 4: Total Scanned */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-5 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Universe Scanned</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-white">{report.totalScanned}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
              EQ Series
            </span>
          </div>
          <p className="text-[11px] text-gray-500">Total qualified breakout candidates: {report.stocks.length}</p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-3">
          {/* Window Selector Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedWindow('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedWindow === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              All Breakouts ({report.stocks.length})
            </button>
            <button
              onClick={() => setSelectedWindow('1Y')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedWindow === '1Y'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              1Y Breakout ({report.breakoutCounts['1Y']})
            </button>
            <button
              onClick={() => setSelectedWindow('ATH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedWindow === 'ATH'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              ATH Breakout ({report.breakoutCounts['ATH']})
            </button>
            {(['2Y', '3Y', '5Y', '10Y'] as BreakoutWindow[]).map((win) => {
              const isAvail = report.windowAvailability[win].available;
              return (
                <button
                  key={win}
                  onClick={() => setSelectedWindow(win)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    selectedWindow === win
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-900 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {win} Breakout
                  {!isAvail && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 font-normal">
                      ~{report.windowAvailability[win].requiredDays}d
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search & Sector Filters */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search symbol / sector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 w-48"
            />
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            >
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec === 'ALL' ? 'All Sectors' : sec}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Informational Data Depth Banner for Unavailable Windows */}
        {isSelectedWindowUnavailable && (
          <div className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-4 text-xs text-amber-300 flex items-start gap-3">
            <span className="text-base">⚠️</span>
            <div>
              <p className="font-bold">
                {selectedWindow} Breakout Calculation Awaiting Historical Depth
              </p>
              <p className="text-gray-400 mt-0.5">
                The current database has {report.tradingDaysAvailable} trading days of Bhavcopy history. The{' '}
                {selectedWindow} window requires {report.windowAvailability[selectedWindow as BreakoutWindow]?.requiredDays} days
                and will automatically self-populate as daily Bhavcopy records accumulate.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Breakout Table */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 uppercase font-semibold bg-gray-950/60">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Symbol</th>
                <th className="py-3 px-4">Sector</th>
                <th className="py-3 px-4 text-right">CMP (₹)</th>
                <th className="py-3 px-4 text-right">Day Chg</th>
                <th className="py-3 px-4 text-center">Strongest BO</th>
                <th className="py-3 px-4 text-center">VPA Footprint</th>
                <th className="py-3 px-4 text-right">BO Price (₹)</th>
                <th className="py-3 px-4 text-right">Gain over BO</th>
                <th className="py-3 px-4 text-center">1Y</th>
                <th className="py-3 px-4 text-center">2Y</th>
                <th className="py-3 px-4 text-center">3Y</th>
                <th className="py-3 px-4 text-center">5Y</th>
                <th className="py-3 px-4 text-center">10Y</th>
                <th className="py-3 px-4 text-center">ATH</th>
                <th className="py-3 px-4 text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-12 text-center text-gray-500">
                    No breakout stocks match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredStocks.map((stock, idx) => (
                  <tr key={stock.symbol} className="hover:bg-gray-800/40 transition">
                    <td className="py-3 px-4 text-gray-500 font-mono">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-white tracking-wide">{stock.symbol}</td>
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
                        className={`px-2.5 py-0.5 rounded text-[10px] font-black tracking-wider border ${getStrongestBadgeClass(
                          stock.strongestBreakout
                        )}`}
                      >
                        {stock.strongestBreakout || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {stock.vpaFootprint ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            stock.vpaFootprint.badgeVariant === 'success'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                              : stock.vpaFootprint.badgeVariant === 'info'
                              ? 'bg-blue-950/80 text-blue-300 border-blue-700'
                              : stock.vpaFootprint.badgeVariant === 'danger'
                              ? 'bg-rose-950/80 text-rose-300 border-rose-700'
                              : stock.vpaFootprint.badgeVariant === 'warning'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-700'
                              : 'bg-gray-800 text-gray-400 border-gray-700'
                          }`}
                          title={stock.vpaFootprint.description}
                        >
                          {stock.vpaFootprint.label}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-300">
                      {stock.breakoutPrice
                        ? `₹${stock.breakoutPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      {stock.breakoutGainPct !== null && stock.breakoutGainPct >= 0
                        ? `+${stock.breakoutGainPct}%`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <WindowBadge status={stock.breakout1Y} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <WindowBadge status={stock.breakout2Y} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <WindowBadge status={stock.breakout3Y} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <WindowBadge status={stock.breakout5Y} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <WindowBadge status={stock.breakout10Y} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <WindowBadge status={stock.breakoutATH} isAth />
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-400">
                      {stock.volume.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function WindowBadge({ status, isAth = false }: { status: boolean | null; isAth?: boolean }) {
  if (status === null) {
    return <span className="text-[10px] text-gray-600 font-mono" title="Insufficient historical data">N/A</span>;
  }
  if (status === true) {
    return (
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${
          isAth
            ? 'bg-indigo-950 text-indigo-300 border-indigo-700'
            : 'bg-emerald-950 text-emerald-300 border-emerald-700'
        }`}
      >
        YES
      </span>
    );
  }
  return <span className="text-gray-600">—</span>;
}

function getStrongestBadgeClass(strongest: BreakoutStock['strongestBreakout']) {
  switch (strongest) {
    case 'ATH':
      return 'bg-indigo-950 text-indigo-300 border-indigo-700';
    case '10Y':
    case '5Y':
    case '3Y':
    case '2Y':
      return 'bg-purple-950 text-purple-300 border-purple-700';
    case '1Y':
      return 'bg-emerald-950 text-emerald-300 border-emerald-700';
    default:
      return 'bg-gray-800 text-gray-400 border-gray-700';
  }
}
