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
import { StockDetailDrawer, type DrawerStockData } from '@/components/enterprise/StockDetailDrawer';
import {
  Zap,
  RefreshCw,
  Search,
  Activity,
  Layers,
  Award,
  AlertTriangle,
  Sliders,
} from 'lucide-react';
import { fmt } from '@/utils/format';

export default function MultiYearBreakoutPage() {
  const [report, setReport] = useState<MultiYearBreakoutReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<BreakoutWindow | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');

  // Stock Detail Drawer state
  const [drawerStock, setDrawerStock] = useState<DrawerStockData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const controller = new AbortController();
    fetchBreakouts(false, controller.signal);
    return () => {
      isMounted.current = false;
      controller.abort();
    };
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
      if (selectedWindow === '1Y' && stock.breakout1Y !== true) return false;
      if (selectedWindow === '2Y' && stock.breakout2Y !== true) return false;
      if (selectedWindow === '3Y' && stock.breakout3Y !== true) return false;
      if (selectedWindow === '5Y' && stock.breakout5Y !== true) return false;
      if (selectedWindow === '10Y' && stock.breakout10Y !== true) return false;
      if (selectedWindow === 'ATH' && stock.breakoutATH !== true) return false;

      if (selectedSector !== 'ALL' && stock.sector !== selectedSector) return false;

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

  const handleStockClick = (stock: BreakoutStock) => {
    setDrawerStock({
      symbol: stock.symbol,
      ltp: stock.close,
      previousClose: stock.prevClose,
      sector: stock.sector,
      signals: [stock.strongestBreakout ? `${stock.strongestBreakout}_BREAKOUT` : 'BREAKOUT'],
      signalSummary: stock.strongestBreakout ? `${stock.strongestBreakout} Breakout` : 'Breakout',
    });
    setDrawerOpen(true);
  };

  const handleExportCsv = () => {
    if (!report) return;
    const headers = [
      'Rank',
      'Symbol',
      'Sector',
      'CMP',
      'Change %',
      'Strongest Breakout',
      'VPA Footprint',
      'Breakout Price',
      'Gain Over Breakout %',
      '1Y',
      '2Y',
      '3Y',
      '5Y',
      '10Y',
      'ATH',
      'Volume',
    ];
    const rows = filteredStocks.map((s, idx) => [
      idx + 1,
      s.symbol,
      s.sector,
      s.close,
      s.changePct,
      s.strongestBreakout || '—',
      s.vpaFootprint?.label || '—',
      s.breakoutPrice || '—',
      s.breakoutGainPct ?? '—',
      s.breakout1Y ? 'YES' : 'NO',
      s.breakout2Y ? 'YES' : 'NO',
      s.breakout3Y ? 'YES' : 'NO',
      s.breakout5Y ? 'YES' : 'NO',
      s.breakout10Y ? 'YES' : 'NO',
      s.breakoutATH ? 'YES' : 'NO',
      s.volume,
    ]);
    const csvContent = generateCsvContent(headers, rows);
    const dateStr = report.date || new Date().toISOString().split('T')[0];
    downloadFile(
      csvContent,
      `multi_year_breakouts_${selectedWindow.toLowerCase()}_${dateStr}.csv`
    );
  };

  if (loading && !report) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-16 flex items-center justify-center font-mono">
        <div className="text-center space-y-3">
          <RefreshCw size={24} className="animate-spin text-accent-blue mx-auto" />
          <p className="text-xs text-text-tertiary">Scanning 2,600+ symbols for Multi-Year Breakouts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-12 flex items-center justify-center font-mono">
        <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg p-6 max-w-md text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-accent-red font-bold text-sm">
            <AlertTriangle size={18} />
            Error Loading Breakout Scanner
          </div>
          <p className="text-xs text-text-secondary">{error}</p>
          <button
            type="button"
            onClick={() => fetchBreakouts(true)}
            className="px-3.5 py-1.5 bg-accent-red hover:bg-accent-red/90 text-white font-semibold rounded-md text-xs transition-colors"
          >
            Retry Scan
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

    const isSelectedWindowUnavailable =
    selectedWindow !== 'ALL' &&
    report.windowAvailability[selectedWindow as BreakoutWindow]?.available === false;

  const athCount = report.breakoutCounts?.['ATH'] ?? report.stocks.filter((s) => s.breakoutATH === true).length;
  const isFiveYearAvail = report.windowAvailability?.['5Y']?.available !== false;
  const fiveYearCount = report.stocks.filter((s) => s.breakout5Y === true).length;
  const oneYearCount = report.breakoutCounts?.['1Y'] ?? report.stocks.filter((s) => s.breakout1Y === true).length;

  return (
    <div className="space-y-4 font-mono select-none">
      {/* ── Status Banner ── */}
      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-xs font-semibold text-accent-blue animate-pulse">
          <RefreshCw size={13} className="animate-spin" />
          <span>Rescanning multi-year high records across 2,600+ symbols... Please wait.</span>
        </div>
      )}

      {/* ── Workstation Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-1.5 rounded-md bg-accent-blue/10 text-accent-blue shrink-0">
              <Zap size={18} />
            </span>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Multi-Year Breakout Terminal
            </h1>
            <span className="text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-2 py-0.5 rounded font-semibold uppercase shrink-0">
              {report.date}
            </span>
            <span className="text-[10px] bg-bg-tertiary text-text-secondary border border-border-primary px-2 py-0.5 rounded font-medium shrink-0">
              Depth: {report.tradingDaysAvailable} Trading Days (1Y &amp; ATH Active • 2Y–10Y Awaiting Depth)
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Structural multi-year price breakouts (1Y, 2Y, 3Y, 5Y, 10Y, ATH) with VPA volume confirmation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportActions onExportCsv={handleExportCsv} />
          <button
            type="button"
            onClick={() => fetchBreakouts(true)}
            disabled={loading || isRefreshing}
            className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white font-semibold rounded-md text-xs transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw size={13} className={loading || isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Scanning...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Top KPI Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Layers size={11} className="text-accent-blue" />
              Total Breakouts
            </span>
            <span className="text-[8px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">ALL</span>
          </div>
          <div className="text-2xl font-bold text-text-primary mt-1">
            {report.stocks.length}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">
            {report.totalScanned ? `${report.totalScanned.toLocaleString('en-IN')} Scanned` : 'Active Breakouts'}
          </div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Award size={11} className="text-accent-purple" />
              All-Time Highs
            </span>
            <span className="text-[8px] bg-accent-purple/10 text-accent-purple font-bold px-1 rounded">ATH</span>
          </div>
          <div className="text-2xl font-bold text-accent-purple mt-1">
            {athCount}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Peak Dataset Highs ({report.tradingDaysAvailable}d)</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Activity size={11} className="text-accent-green" />
              5-Year Breakouts
            </span>
            <span className={`text-[8px] font-bold px-1 rounded ${isFiveYearAvail ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-amber/10 text-accent-amber'}`}>
              5Y
            </span>
          </div>
          {isFiveYearAvail ? (
            <div className="text-2xl font-bold text-accent-green mt-1">
              {fiveYearCount}
            </div>
          ) : (
            <div className="text-base font-bold text-text-tertiary mt-2 flex items-center gap-1.5">
              <span>OFFLINE</span>
              <span className="text-[9px] bg-accent-amber/10 text-accent-amber border border-accent-amber/20 px-1 py-0.2 rounded font-normal">
                {report.tradingDaysAvailable}/1,250d
              </span>
            </div>
          )}
          <div className="text-[10px] text-text-tertiary mt-0.5">
            {isFiveYearAvail ? 'Decade Expansion Base' : 'Awaiting 5Y History'}
          </div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Zap size={11} className="text-accent-amber" />
              1-Year Highs
            </span>
            <span className="text-[8px] bg-accent-amber/10 text-accent-amber font-bold px-1 rounded">1Y</span>
          </div>
          <div className="text-2xl font-bold text-accent-amber mt-1">
            {oneYearCount}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">52-Week Expansion (Active)</div>
        </div>
      </div>

      {/* ── Filters & Controls Bar ── */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Breakout Window Filter Chips */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-text-tertiary uppercase font-semibold mr-1 flex items-center gap-1">
              <Sliders size={11} />
              Window:
            </span>
            {(['ALL', '1Y', '2Y', '3Y', '5Y', '10Y', 'ATH'] as const).map((win) => {
              const isSelected = selectedWindow === win;
              const availInfo = win !== 'ALL' ? report.windowAvailability[win as BreakoutWindow] : undefined;
              const isAvail = win === 'ALL' || availInfo?.available !== false;

              return (
                <button
                  key={win}
                  type="button"
                  onClick={() => setSelectedWindow(win)}
                  title={availInfo ? availInfo.label : undefined}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
                    isSelected
                      ? 'bg-accent-blue text-white shadow-sm'
                      : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
                  } ${!isAvail ? 'opacity-70' : ''}`}
                >
                  <span>{win}</span>
                  {!isAvail && (
                    <span className="text-[9px] bg-accent-amber/15 text-accent-amber border border-accent-amber/30 px-1 py-0.2 rounded font-medium">
                      Offline
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sector Selector */}
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2 py-1 text-xs focus:outline-none focus:border-accent-blue max-w-[130px] sm:max-w-none"
            >
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec === 'ALL' ? 'All Sectors' : sec}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-bg-tertiary border border-border-primary rounded px-2.5 py-1 pl-7 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue w-28 sm:w-44"
              />
            </div>

            {/* Density Toggle */}
            <div className="flex items-center border border-border-primary rounded overflow-hidden text-[10px]">
              <button
                type="button"
                onClick={() => setDensity('compact')}
                className={`px-2 py-0.5 transition-colors ${
                  density === 'compact' ? 'bg-accent-blue text-white font-bold' : 'bg-bg-tertiary text-text-secondary'
                }`}
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => setDensity('comfortable')}
                className={`px-2 py-0.5 transition-colors ${
                  density === 'comfortable' ? 'bg-accent-blue text-white font-bold' : 'bg-bg-tertiary text-text-secondary'
                }`}
              >
                Detailed
              </button>
            </div>
          </div>
        </div>

        {/* Unavailable Window Historical Depth Alert */}
        {isSelectedWindowUnavailable && (
          <div className="bg-accent-amber/10 border border-accent-amber/30 rounded-md p-2.5 text-xs text-accent-amber flex items-start gap-2">
            <span className="font-bold">⚠️</span>
            <div className="text-[11px]">
              <span className="font-bold">{selectedWindow} Breakout Calculation Awaiting Historical Depth:</span>{' '}
              The database has {report.tradingDaysAvailable} days of history. This window requires{' '}
              {report.windowAvailability[selectedWindow as BreakoutWindow]?.requiredDays} days and will self-populate as daily Bhavcopy records accumulate.
            </div>
          </div>
        )}
      </div>

      {/* ── Breakout Table (Enterprise Table) ── */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left whitespace-nowrap font-mono">
            <thead className="sticky top-0 bg-bg-tertiary text-text-secondary text-[10px] uppercase tracking-wider border-b border-border-primary">
              <tr>
                <th className="py-2 px-3 font-semibold text-center">#</th>
                <th className="sticky left-0 bg-bg-tertiary py-2 px-3 font-semibold">Stock</th>
                <th className="py-2 px-3 font-semibold">Sector</th>
                <th className="py-2 px-3 font-semibold text-right">CMP (₹)</th>
                <th className="py-2 px-3 font-semibold text-right">Day Chg</th>
                <th className="py-2 px-3 font-semibold text-center">Strongest BO</th>
                <th className="py-2 px-3 font-semibold text-center">VPA Footprint</th>
                <th className="py-2 px-3 font-semibold text-right">BO Price (₹)</th>
                <th className="py-2 px-3 font-semibold text-right">Gain over BO</th>
                <th className="py-2 px-3 font-semibold text-center">1Y</th>
                <th className="py-2 px-3 font-semibold text-center">2Y</th>
                <th className="py-2 px-3 font-semibold text-center">3Y</th>
                <th className="py-2 px-3 font-semibold text-center">5Y</th>
                <th className="py-2 px-3 font-semibold text-center">10Y</th>
                <th className="py-2 px-3 font-semibold text-center">ATH</th>
                <th className="py-2 px-3 font-semibold text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary/40">
              {filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-12 px-4 text-center">
                    {isSelectedWindowUnavailable ? (
                      <div className="max-w-md mx-auto space-y-2">
                        <div className="flex items-center justify-center gap-1.5 text-accent-amber font-semibold text-xs">
                          <AlertTriangle size={15} />
                          <span>{selectedWindow} Window Offline — Insufficient Historical Depth</span>
                        </div>
                        <p className="text-xs text-text-tertiary">
                          This window requires {report.windowAvailability[selectedWindow as BreakoutWindow]?.requiredDays} trading days of history. The platform currently has {report.tradingDaysAvailable} days available.
                        </p>
                        <p className="text-[11px] text-text-muted">
                          Historical Bhavcopy records continue accumulating daily. Switch to the <strong>1Y</strong> or <strong>ATH</strong> window to view active breakouts.
                        </p>
                      </div>
                    ) : searchQuery || selectedSector !== 'ALL' ? (
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-text-secondary">No matching breakouts found</div>
                        <p className="text-[11px] text-text-tertiary">
                          No stocks matched your search query &quot;{searchQuery}&quot; or sector filter &quot;{selectedSector}&quot;.
                        </p>
                      </div>
                    ) : (
                      <div className="max-w-lg mx-auto space-y-2">
                        <div className="text-xs font-semibold text-text-primary">
                          No Structural Closing Breakouts on {report.date}
                        </div>
                        <p className="text-xs text-text-tertiary">
                          Scanned {report.totalScanned ? report.totalScanned.toLocaleString('en-IN') : '2,400+'} operating NSE equities across active series. 0 stocks closed at or above their prior 1-Year (250-day) or All-Time High pivots during this session.
                        </p>
                        <p className="text-[11px] text-text-muted">
                          Intraday high tests that failed to close above resistance are excluded by design to prevent false breakout / wick-trap entries.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredStocks.map((stock, idx) => {
                  const rowPad = density === 'compact' ? 'py-1.5 px-3' : 'py-2.5 px-3';
                  const isPositive = stock.changePct >= 0;

                  return (
                    <tr key={stock.symbol} className="hover:bg-bg-tertiary/40 transition-colors">
                      <td className={`${rowPad} text-center text-text-tertiary font-bold`}>{idx + 1}</td>
                      <td className={`sticky left-0 bg-bg-secondary hover:bg-bg-tertiary/40 font-bold text-text-primary ${rowPad}`}>
                        <button
                          type="button"
                          onClick={() => handleStockClick(stock)}
                          className="hover:text-accent-blue transition-colors underline decoration-border-secondary text-left font-bold"
                          title="Open Stock Detail Drawer"
                        >
                          {stock.symbol}
                        </button>
                      </td>
                      <td className={`${rowPad} text-text-secondary`}>{stock.sector}</td>
                      <td className={`${rowPad} text-right font-bold text-text-primary`}>
                        ₹{fmt(stock.close)}
                      </td>
                      <td className={`${rowPad} text-right font-bold ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
                        {isPositive ? `+${stock.changePct}%` : `${stock.changePct}%`}
                      </td>
                      <td className={`${rowPad} text-center`}>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStrongestBadgeStyle(stock.strongestBreakout)}`}>
                          {stock.strongestBreakout || '—'}
                        </span>
                      </td>
                      <td className={`${rowPad} text-center`}>
                        {stock.vpaFootprint ? (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${getVpaBadgeStyle(stock.vpaFootprint.badgeVariant)}`}
                            title={stock.vpaFootprint.description}
                          >
                            {stock.vpaFootprint.label}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className={`${rowPad} text-right text-text-secondary`}>
                        {stock.breakoutPrice ? `₹${fmt(stock.breakoutPrice)}` : '—'}
                      </td>
                      <td className={`${rowPad} text-right font-bold text-accent-green`}>
                        {stock.breakoutGainPct !== null && stock.breakoutGainPct >= 0 ? `+${stock.breakoutGainPct}%` : '—'}
                      </td>
                      <td className={`${rowPad} text-center`}><WindowBadge status={stock.breakout1Y} /></td>
                      <td className={`${rowPad} text-center`}><WindowBadge status={stock.breakout2Y} /></td>
                      <td className={`${rowPad} text-center`}><WindowBadge status={stock.breakout3Y} /></td>
                      <td className={`${rowPad} text-center`}><WindowBadge status={stock.breakout5Y} /></td>
                      <td className={`${rowPad} text-center`}><WindowBadge status={stock.breakout10Y} /></td>
                      <td className={`${rowPad} text-center`}>
                        <WindowBadge status={stock.breakoutATH} isAth isDatasetLimited={report.tradingDaysAvailable < 500} />
                      </td>
                      <td className={`${rowPad} text-right text-text-tertiary`}>
                        {stock.volume ? Number(stock.volume).toLocaleString('en-IN') : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Slide-Over Stock Detail Drawer ── */}
      <StockDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        stock={drawerStock}
      />
    </div>
  );
}

function WindowBadge({
  status,
  isAth = false,
  isDatasetLimited = false,
}: {
  status: boolean | null;
  isAth?: boolean;
  isDatasetLimited?: boolean;
}) {
  if (status === null) {
    return <span className="text-[10px] text-text-tertiary font-mono" title="Insufficient historical data">N/A</span>;
  }
  if (status === true) {
    return (
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
          isAth
            ? 'bg-accent-purple/10 text-accent-purple border-accent-purple/20'
            : 'bg-accent-green/10 text-accent-green border-accent-green/20'
        }`}
        title={isAth && isDatasetLimited ? 'Dataset-limited ATH (available history)' : undefined}
      >
        {isAth && isDatasetLimited ? 'YES*' : 'YES'}
      </span>
    );
  }
  return <span className="text-text-tertiary">—</span>;
}

function getStrongestBadgeStyle(strongest: BreakoutStock['strongestBreakout']) {
  switch (strongest) {
    case 'ATH':
      return 'bg-accent-purple/10 text-accent-purple border-accent-purple/20';
    case '10Y':
    case '5Y':
    case '3Y':
    case '2Y':
      return 'bg-accent-blue/10 text-accent-blue border-accent-blue/20';
    case '1Y':
      return 'bg-accent-green/10 text-accent-green border-accent-green/20';
    default:
      return 'bg-bg-tertiary text-text-tertiary border-border-primary';
  }
}

function getVpaBadgeStyle(variant: string) {
  switch (variant) {
    case 'success':
      return 'bg-accent-green/10 text-accent-green border-accent-green/20';
    case 'info':
      return 'bg-accent-blue/10 text-accent-blue border-accent-blue/20';
    case 'danger':
      return 'bg-accent-red/10 text-accent-red border-accent-red/20';
    case 'warning':
      return 'bg-accent-amber/10 text-accent-amber border-accent-amber/20';
    default:
      return 'bg-bg-tertiary text-text-tertiary border-border-primary';
  }
}
