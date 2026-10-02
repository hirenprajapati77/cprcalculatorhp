'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  MomentumLeadersReport,
  MomentumStock,
  MomentumTier,
  MomentumUniverse,
} from '@/services/market-tools/momentum-leaders.service';
import { BreakoutVpaStatus } from '@/services/vpa/vpa.math';
import { ExportActions } from '@/components/market-tools/ExportActions';
import { generateCsvContent, downloadFile } from '@/lib/export-utils';
import { StockDetailDrawer, type DrawerStockData } from '@/components/enterprise/StockDetailDrawer';
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
  Layers,
  Sliders,
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
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');

  // Stock Detail Drawer state
  const [drawerStock, setDrawerStock] = useState<DrawerStockData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const handleStockClick = (stock: MomentumStock) => {
    setDrawerStock({
      symbol: stock.symbol,
      ltp: stock.close,
      previousClose: stock.prevClose,
      sector: stock.sector,
      signals: [`${stock.tier}_MOMENTUM`, `${stock.leaderWindowCount}_OF_4_LEAD`],
      signalSummary: `Tier ${stock.tier} (${stock.leaderWindowCount}/4 Windows)`,
    });
    setDrawerOpen(true);
  };

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
        return 'bg-accent-green/10 text-accent-green border-accent-green/30';
      case 'A':
        return 'bg-accent-blue/10 text-accent-blue border-accent-blue/30';
      case 'B':
        return 'bg-accent-amber/10 text-accent-amber border-accent-amber/30';
      default:
        return 'bg-bg-tertiary text-text-tertiary border-border-primary';
    }
  };

  const getVpaBadge = (status: BreakoutVpaStatus) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-accent-green/10 text-accent-green border-accent-green/30';
      case 'ABSORPTION':
        return 'bg-accent-blue/10 text-accent-blue border-accent-blue/30';
      case 'NO_DEMAND':
        return 'bg-accent-amber/10 text-accent-amber border-accent-amber/30';
      case 'CLIMAX_REJECT':
        return 'bg-accent-red/10 text-accent-red border-accent-red/30';
      default:
        return 'bg-bg-tertiary text-text-tertiary border-border-primary';
    }
  };

  return (
    <div className="space-y-4 font-mono select-none">
      {/* ── Status Banners ── */}
      {!isRefreshing && report?.status === 'pending' && (
        <div className="flex items-center gap-2 rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-4 py-2 text-xs font-semibold text-accent-amber">
          <span>⏳</span>
          Not yet computed for today — the 19:15 IST precompute job hasn&apos;t run yet, or the cache is cold after a restart. Click Recalculate to scan now.
        </div>
      )}

      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-xs font-semibold text-accent-blue animate-pulse">
          <RefreshCw size={13} className="animate-spin" />
          <span>Rescanning multi-window momentum percentiles across {selectedUniverse === 'NSE_FNO' ? 'F&O' : 'NSE'} universe... Please wait.</span>
        </div>
      )}

      {error && (
        <div className="bg-bg-secondary border border-accent-red/30 rounded-lg p-3 text-xs text-accent-red flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => fetchReport(false)} className="underline hover:text-accent-red/80 font-bold">
            Retry
          </button>
        </div>
      )}

      {/* ── Workstation Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-1.5 rounded-md bg-accent-amber/10 text-accent-amber shrink-0">
              <Flame size={18} />
            </span>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Multi-Window Momentum Leaders
            </h1>
            <span className="text-[10px] bg-accent-amber/10 text-accent-amber border border-accent-amber/30 px-2 py-0.5 rounded font-semibold uppercase shrink-0">
              {selectedUniverse === 'NSE_FNO' ? 'NSE F&O' : 'ALL NSE'}
            </span>
            {report && (
              <span className="text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-2 py-0.5 rounded font-semibold uppercase shrink-0">
                {report.date}
              </span>
            )}
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Surfacing persistent momentum across multiple time horizons (1D, 5D, 10D, 21D) with institutional VPA confirmation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {report && (
            <ExportActions
              onExportCsv={handleExportCsv}
              disabled={filteredStocks.length === 0}
            />
          )}
          <button
            type="button"
            onClick={() => fetchReport(true)}
            disabled={isRefreshing || loading}
            className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white font-semibold rounded-md text-xs transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Scanning...' : 'Recalculate'}</span>
          </button>
        </div>
      </div>

      {/* ── Universe Selector Tabs ── */}
      {report && (
        <div className="flex items-center gap-2 border-b border-border-primary pb-2">
          <button
            type="button"
            onClick={() => handleUniverseChange('NSE_FNO')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              selectedUniverse === 'NSE_FNO'
                ? 'bg-accent-blue text-white shadow-sm'
                : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
            }`}
          >
            F&amp;O Universe {report.universe === 'NSE_FNO' ? `(${report.qualifiedCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => handleUniverseChange('ALL_NSE')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              selectedUniverse === 'ALL_NSE'
                ? 'bg-accent-blue text-white shadow-sm'
                : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
            }`}
          >
            ALL NSE (&ge; ₹10Cr) {report.universe === 'ALL_NSE' ? `(${report.qualifiedCount})` : ''}
          </button>
        </div>
      )}

      {/* ── Top Metric KPI Cards ── */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-bg-secondary border border-border-primary rounded-lg p-3" title="Stocks must meet the ₹10 Cr 20-day average turnover liquidity floor to qualify">
            <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
              <span className="font-semibold flex items-center gap-1">
                <Layers size={11} className="text-accent-blue" />
                Qualified / Scanned
              </span>
            </div>
            <div className="text-xl font-bold text-text-primary mt-1">
              {report.qualifiedCount} <span className="text-xs font-normal text-text-tertiary">/ {report.totalScanned}</span>
            </div>
            <div className="text-[10px] text-text-tertiary mt-0.5">&ge; ₹10 Cr 20D turnover floor</div>
          </div>

          <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
            <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
              <span className="font-semibold flex items-center gap-1">
                <Award size={11} className="text-accent-green" />
                Tier A+ Leaders
              </span>
              <span className="text-[8px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">ELITE</span>
            </div>
            <div className="text-xl font-bold text-accent-green mt-1">
              {report.countsByTier['A+']}
            </div>
            <div className="text-[10px] text-text-tertiary mt-0.5">Score &ge; 90 momentum</div>
          </div>

          <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
            <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
              <span className="font-semibold flex items-center gap-1">
                <Flame size={11} className="text-accent-amber" />
                4-Window Leaders
              </span>
              <span className="text-[8px] bg-accent-amber/10 text-accent-amber font-bold px-1 rounded">4/4</span>
            </div>
            <div className="text-xl font-bold text-accent-amber mt-1">
              {report.countsByLeaderWindows['4_windows']}
            </div>
            <div className="text-[10px] text-text-tertiary mt-0.5">Top 15% across all 4 frames</div>
          </div>

          <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
            <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
              <span className="font-semibold flex items-center gap-1">
                <Zap size={11} className="text-accent-blue" />
                3+ Window Leaders
              </span>
              <span className="text-[8px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">3+</span>
            </div>
            <div className="text-xl font-bold text-accent-blue mt-1">
              {report.countsByLeaderWindows['4_windows'] + report.countsByLeaderWindows['3_windows']}
            </div>
            <div className="text-[10px] text-text-tertiary mt-0.5">Multi-week persistent trend</div>
          </div>

          <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
              <span className="font-semibold flex items-center gap-1">
                <ShieldCheck size={11} className="text-accent-purple" />
                Volume Confirmed
              </span>
              <span className="text-[8px] bg-accent-purple/10 text-accent-purple font-bold px-1 rounded">VPA</span>
            </div>
            <div className="text-xl font-bold text-accent-purple mt-1">
              {report.allStocks.filter(s => s.vpaFootprint.status === 'CONFIRMED').length}
            </div>
            <div className="text-[10px] text-text-tertiary mt-0.5">RVOL &ge; 1.5x + Close on High</div>
          </div>
        </div>
      )}

      {/* ── Filters & Controls Bar ── */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-primary pb-3">
          {/* Window Buttons */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-text-tertiary uppercase font-semibold mr-1 flex items-center gap-1">
              <Sliders size={11} />
              Windows:
            </span>
            <button
              type="button"
              onClick={() => setSelectedWindows('ALL')}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                selectedWindows === 'ALL'
                  ? 'bg-accent-amber text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setSelectedWindows('4')}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                selectedWindows === '4'
                  ? 'bg-accent-amber text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              🔥 4/4 Windows ({report?.countsByLeaderWindows['4_windows'] ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setSelectedWindows('3')}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                selectedWindows === '3'
                  ? 'bg-accent-amber text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              3+ Windows ({((report?.countsByLeaderWindows['4_windows'] ?? 0) + (report?.countsByLeaderWindows['3_windows'] ?? 0))})
            </button>
            <button
              type="button"
              onClick={() => setSelectedWindows('2')}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                selectedWindows === '2'
                  ? 'bg-accent-amber text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              2+ Windows
            </button>
          </div>

          {/* Quality Tier Buttons */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-text-tertiary uppercase font-semibold mr-1 flex items-center gap-1">
              <Award size={11} />
              Tier:
            </span>
            <button
              type="button"
              onClick={() => setSelectedTier('ALL')}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                selectedTier === 'ALL'
                  ? 'bg-accent-blue text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setSelectedTier('A+')}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                selectedTier === 'A+'
                  ? 'bg-accent-green text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              A+ ({report?.countsByTier['A+'] ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTier('A')}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                selectedTier === 'A'
                  ? 'bg-accent-blue text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              A ({report?.countsByTier['A'] ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setSelectedTier('B')}
              className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                selectedTier === 'B'
                  ? 'bg-accent-amber text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              B ({report?.countsByTier['B'] ?? 0})
            </button>
          </div>
        </div>

        {/* Secondary Row: Search, VPA, Sector, Density */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search symbol or sector..."
                className="bg-bg-tertiary border border-border-primary rounded px-2.5 py-1 pl-7 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue w-36 sm:w-48"
              />
            </div>

            {/* VPA Filter */}
            <select
              value={selectedVpa}
              onChange={e => setSelectedVpa(e.target.value as BreakoutVpaStatus | 'ALL')}
              className="bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-accent-blue"
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
              className="bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-accent-blue"
            >
              <option value="ALL">All Sectors ({sectors.length})</option>
              {sectors.map(sec => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
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

      {/* ── Main Data Table ── */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-text-tertiary space-y-3">
            <RefreshCw size={24} className="animate-spin mx-auto text-accent-blue" />
            <p className="text-xs">Computing multi-window momentum percentiles and VPA footprints...</p>
          </div>
        ) : filteredStocks.length === 0 ? (
          <div className="p-12 text-center text-text-tertiary space-y-2">
            <p className="text-sm font-semibold">No momentum leaders found matching current filters</p>
            <p className="text-xs">Try broadening your window or tier selection.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap font-mono">
              <thead className="sticky top-0 bg-bg-tertiary text-text-secondary text-[10px] uppercase tracking-wider border-b border-border-primary">
                <tr>
                  <th className="py-2 px-3 font-semibold text-center">#</th>
                  <th className="sticky left-0 bg-bg-tertiary py-2 px-3 font-semibold">Stock</th>
                  <th className="py-2 px-3 font-semibold text-right">LTP (₹)</th>
                  <th className="py-2 px-3 font-semibold text-right">1D %</th>
                  <th className="py-2 px-3 font-semibold text-center">Consistency</th>
                  <th className="py-2 px-3 font-semibold text-center">1D Window</th>
                  <th className="py-2 px-3 font-semibold text-center">5D (~1W)</th>
                  <th className="py-2 px-3 font-semibold text-center">10D (~2W)</th>
                  <th className="py-2 px-3 font-semibold text-center">21D (~1M)</th>
                  <th className="py-2 px-3 font-semibold">VPA Footprint</th>
                  <th className="py-2 px-3 font-semibold text-right">RVOL</th>
                  <th className="py-2 px-3 font-semibold text-right">Turnover</th>
                  <th className="py-2 px-3 font-semibold text-center">Score</th>
                  <th className="py-2 px-3 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary/40">
                {filteredStocks.map((stock, idx) => {
                  const isExpanded = expandedSymbol === stock.symbol;
                  const rowPad = density === 'compact' ? 'py-1.5 px-3' : 'py-2.5 px-3';
                  const isPositive = stock.changePct >= 0;

                  return (
                    <React.Fragment key={stock.symbol}>
                      <tr className="hover:bg-bg-tertiary/40 transition-colors">
                        <td className={`${rowPad} text-center text-text-tertiary font-bold`}>{idx + 1}</td>
                        <td className={`sticky left-0 bg-bg-secondary hover:bg-bg-tertiary/40 font-bold text-text-primary ${rowPad}`}>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStockClick(stock)}
                              className="hover:text-accent-blue transition-colors underline decoration-border-secondary text-left font-bold"
                              title="Open Stock Detail Drawer"
                            >
                              {stock.symbol}
                            </button>
                            {stock.isCircuitLocked && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wide bg-accent-amber/10 text-accent-amber border border-accent-amber/30"
                                title={`Stock 1D return (${stock.changePct >= 0 ? '+' : ''}${stock.changePct.toFixed(2)}%) is within ±0.20% of the ${stock.circuitLimitPct}% circuit limit. Likely circuit-locked (untradeable at market).`}
                              >
                                <Lock size={9} className="text-accent-amber flex-shrink-0" />
                                {stock.changePct >= 0 ? 'Limit Up' : 'Limit Down'} ({stock.circuitLimitPct}%)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-text-tertiary font-normal">{stock.sector}</div>
                        </td>

                        {/* LTP */}
                        <td className={`${rowPad} text-right font-mono font-bold text-text-primary`}>
                          ₹{stock.close.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>

                        {/* 1D Change */}
                        <td
                          className={`${rowPad} text-right font-mono font-bold ${
                            isPositive ? 'text-accent-green' : 'text-accent-red'
                          }`}
                        >
                          {isPositive ? `+${stock.changePct.toFixed(2)}%` : `${stock.changePct.toFixed(2)}%`}
                        </td>

                        {/* Multi-Window Consistency Badge */}
                        <td className={`${rowPad} text-center`}>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                              stock.leaderWindowCount === 4
                                ? 'bg-accent-amber/10 text-accent-amber border-accent-amber/30'
                                : stock.leaderWindowCount === 3
                                ? 'bg-accent-green/10 text-accent-green border-accent-green/30'
                                : stock.leaderWindowCount === 2
                                ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/30'
                                : 'bg-bg-tertiary text-text-tertiary border-border-primary'
                            }`}
                          >
                            {stock.leaderWindowCount === 4 && <Flame size={9} />}
                            {stock.leaderWindowCount}/4 Lead
                          </span>
                        </td>

                        {/* 1D Window */}
                        <td className={`${rowPad} text-center font-mono`}>
                          <div
                            className={`font-semibold ${
                              stock.windows.w1d.isLeader ? 'text-accent-green font-bold' : 'text-text-secondary'
                            }`}
                          >
                            {stock.windows.w1d.returnPct >= 0 ? '+' : ''}
                            {stock.windows.w1d.returnPct.toFixed(1)}%
                          </div>
                          <div className="text-[9px] text-text-tertiary">
                            Top {stock.windows.w1d.percentile.toFixed(0)}% (#{stock.windows.w1d.rank})
                          </div>
                        </td>

                        {/* 5D Window */}
                        <td className={`${rowPad} text-center font-mono`}>
                          <div
                            className={`font-semibold ${
                              stock.windows.w5d.isLeader ? 'text-accent-green font-bold' : 'text-text-secondary'
                            }`}
                          >
                            {stock.windows.w5d.returnPct >= 0 ? '+' : ''}
                            {stock.windows.w5d.returnPct.toFixed(1)}%
                          </div>
                          <div className="text-[9px] text-text-tertiary">
                            Top {stock.windows.w5d.percentile.toFixed(0)}% (#{stock.windows.w5d.rank})
                          </div>
                        </td>

                        {/* 10D Window */}
                        <td className={`${rowPad} text-center font-mono`}>
                          <div
                            className={`font-semibold ${
                              stock.windows.w10d.isLeader ? 'text-accent-green font-bold' : 'text-text-secondary'
                            }`}
                          >
                            {stock.windows.w10d.returnPct >= 0 ? '+' : ''}
                            {stock.windows.w10d.returnPct.toFixed(1)}%
                          </div>
                          <div className="text-[9px] text-text-tertiary">
                            Top {stock.windows.w10d.percentile.toFixed(0)}% (#{stock.windows.w10d.rank})
                          </div>
                        </td>

                        {/* 21D Window */}
                        <td className={`${rowPad} text-center font-mono`}>
                          <div
                            className={`font-semibold ${
                              stock.windows.w21d.isLeader ? 'text-accent-green font-bold' : 'text-text-secondary'
                            }`}
                          >
                            {stock.windows.w21d.returnPct >= 0 ? '+' : ''}
                            {stock.windows.w21d.returnPct.toFixed(1)}%
                          </div>
                          <div className="text-[9px] text-text-tertiary">
                            Top {stock.windows.w21d.percentile.toFixed(0)}% (#{stock.windows.w21d.rank})
                          </div>
                        </td>

                        {/* VPA Footprint */}
                        <td className={`${rowPad}`}>
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold border ${getVpaBadge(
                              stock.vpaFootprint.status
                            )}`}
                          >
                            {stock.vpaFootprint.label}
                          </span>
                        </td>

                        {/* RVOL */}
                        <td className={`${rowPad} text-right font-mono text-text-secondary`}>
                          {stock.rvol20d !== null ? `${stock.rvol20d.toFixed(1)}x` : '—'}
                        </td>

                        {/* Turnover */}
                        <td className={`${rowPad} text-right font-mono text-text-tertiary`}>
                          ₹{stock.turnoverCr.toFixed(1)}Cr
                        </td>

                        {/* Score & Tier */}
                        <td className={`${rowPad} text-center`}>
                          <div className="inline-flex items-center gap-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getTierBadge(
                                stock.tier
                              )}`}
                            >
                              {stock.compositeScore}
                            </span>
                            <span className="text-[9px] font-bold text-text-tertiary">
                              {stock.tier}
                            </span>
                          </div>
                        </td>

                        {/* Action */}
                        <td className={`${rowPad} text-center`}>
                          <button
                            type="button"
                            onClick={() => setExpandedSymbol(isExpanded ? null : stock.symbol)}
                            className="px-2 py-0.5 bg-bg-tertiary hover:bg-border-primary text-text-secondary rounded text-[9px] font-semibold transition-colors flex items-center gap-1 mx-auto"
                          >
                            <span>{isExpanded ? 'Hide' : 'Details'}</span>
                            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Mathematical Breakdown */}
                      {isExpanded && (
                        <tr className="bg-bg-primary/90 border-b border-border-primary">
                          <td colSpan={14} className="p-4 space-y-3 whitespace-normal">
                            <div className="max-w-4xl mx-auto space-y-3 text-xs">
                              <div className="flex items-center gap-2 text-accent-amber font-semibold">
                                <Info size={14} />
                                <span>Momentum Score Audit for {stock.symbol}</span>
                              </div>

                              {stock.isCircuitLocked && (
                                <div className="p-3 bg-accent-amber/10 border border-accent-amber/30 rounded-lg text-[11px] text-accent-amber flex items-center gap-2.5">
                                  <Lock size={15} className="text-accent-amber flex-shrink-0" />
                                  <span>
                                    <strong>Circuit Lock Warning:</strong> 1D return of {stock.changePct >= 0 ? '+' : ''}{stock.changePct.toFixed(2)}% is within &plusmn;0.20% of the {stock.circuitLimitPct}% price band. In cash equities, circuit-locked stocks typically cannot be entered or exited at market prices due to lack of sellers/buyers.
                                  </span>
                                </div>
                              )}

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-bg-secondary p-3 rounded-lg border border-border-primary">
                                <div>
                                  <div className="text-text-tertiary text-[10px]">Base Weighted Momentum</div>
                                  <div className="font-mono font-bold text-text-primary text-sm mt-0.5">
                                    {stock.baseScore.toFixed(2)} pts
                                  </div>
                                  <div className="text-[9px] text-text-tertiary">
                                    0.85 &times; (0.15&middot;1D + 0.25&middot;5D + 0.30&middot;10D + 0.30&middot;21D)
                                  </div>
                                </div>

                                <div>
                                  <div className="text-text-tertiary text-[10px]">Consistency Bonus</div>
                                  <div className="font-mono font-bold text-accent-green text-sm mt-0.5">
                                    +{stock.consistencyBonus.toFixed(2)} pts
                                  </div>
                                  <div className="text-[9px] text-text-tertiary">
                                    +2.5 pts &times; {stock.leaderWindowCount} windows in Top 15%
                                  </div>
                                </div>

                                <div>
                                  <div className="text-text-tertiary text-[10px]">Dispersion Penalty</div>
                                  <div className="font-mono font-bold text-accent-red text-sm mt-0.5">
                                    -{stock.dispersionPenalty.toFixed(2)} pts
                                  </div>
                                  <div className="text-[9px] text-text-tertiary">
                                    -0.10 &times; sample_std across windows
                                  </div>
                                </div>

                                <div>
                                  <div className="text-text-tertiary text-[10px]">VPA Volume Modifier</div>
                                  <div
                                    className={`font-mono font-bold text-sm mt-0.5 ${
                                      stock.vpaModifier >= 0 ? 'text-accent-green' : 'text-accent-red'
                                    }`}
                                  >
                                    {stock.vpaModifier >= 0 ? '+' : ''}
                                    {stock.vpaModifier} pts
                                  </div>
                                  <div className="text-[9px] text-text-tertiary">
                                    {stock.vpaFootprint.label} ({stock.vpaFootprint.description})
                                  </div>
                                </div>
                              </div>

                              <div className="text-[11px] text-text-tertiary">
                                <strong>Final Formula:</strong> min(100, max(0, round({stock.baseScore} + {stock.consistencyBonus} - {stock.dispersionPenalty} + {stock.vpaModifier}))) = <strong className="text-text-primary">{stock.compositeScore} / 100</strong> (Tier {stock.tier})
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

      {/* Stock Detail Drawer Integration */}
      <StockDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        stock={drawerStock}
      />
    </div>
  );
}
