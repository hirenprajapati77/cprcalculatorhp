'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { isLikelyEtfOrFund } from '@/lib/nse-fund-exclusion';
import { ExportActions } from '@/components/market-tools/ExportActions';
import { generateCsvContent, downloadFile } from '@/lib/export-utils';
import {
  PatternBreakoutReport,
  PatternBreakoutStock,
  PatternType,
  BreakoutStatus,
} from '@/services/market-tools/pattern-breakout.service';
import { StockDetailDrawer, type DrawerStockData } from '@/components/enterprise/StockDetailDrawer';
import {
  Zap,
  RefreshCw,
  Search,
  Activity,
  Layers,
  Award,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

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
  const [tradeReadyOnly, setTradeReadyOnly] = useState(false);
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');

  // Stock Detail Drawer state
  const [drawerStock, setDrawerStock] = useState<DrawerStockData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const isMounted = useRef(true);
  const refreshControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMounted.current = true;
    const abortController = new AbortController();
    fetchReport(false, abortController.signal);
    return () => {
      isMounted.current = false;
      abortController.abort();
      if (refreshControllerRef.current) {
        refreshControllerRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pollForReport(attempt = 1, maxAttempts = 30, signal?: AbortSignal) {
    if (!isMounted.current) return;
    if (attempt > maxAttempts) {
      if (isMounted.current) {
        setError('Pattern scan timed out. Please try refreshing again later.');
        setIsRefreshing(false);
        setLoading(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/market-tools/pattern-breakout', { signal: signal ?? null });
      const json = await res.json();
      if (!isMounted.current) return;

      if (res.status === 202 || json.status === 'processing') {
        setTimeout(() => pollForReport(attempt + 1, maxAttempts, signal), 3000);
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
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err));
        setIsRefreshing(false);
        setLoading(false);
      }
    }
  }

  async function fetchReport(forceRefresh = false, signal?: AbortSignal) {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else if (!report) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`/api/market-tools/pattern-breakout${forceRefresh ? '?refresh=true' : ''}`, { signal: signal ?? null });
      const json = await res.json();
      if (!isMounted.current) return;

      if (res.status === 202 || json.status === 'processing') {
        pollForReport(1, 30, signal);
        return;
      }

      if (json.success && json.data) {
        setReport(json.data);
      } else {
        setError(json.error || 'Failed to fetch pattern breakout report');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isMounted.current) {
        if (!forceRefresh) setLoading(false);
        if (forceRefresh) setIsRefreshing(false);
      }
    }
  }

  const handleRefresh = () => {
    if (refreshControllerRef.current) {
      refreshControllerRef.current.abort();
    }
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    fetchReport(true, controller.signal);
  };

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

      // Trade-Ready filter: Tier A/A+, RVOL >= 1.75x, real chart pattern (not
      // Raw 52W High), and ETF/liquid-fund symbols excluded.
      if (tradeReadyOnly) {
        const tier = stock.scoreBreakdown.qualityTier;
        if (tier !== 'A+' && tier !== 'A') return false;
        if (stock.rvol20d === null || stock.rvol20d < 1.75) return false;
        if (stock.primaryPattern === 'NONE') return false;
        if (isLikelyEtfOrFund(stock.symbol)) return false;
      }

      return true;
    });
  }, [report, selectedPattern, selectedStatus, selectedTier, selectedSector, searchQuery, tradeReadyOnly]);

  const handleStockClick = (stock: PatternBreakoutStock) => {
    setDrawerStock({
      symbol: stock.symbol,
      ltp: stock.close,
      previousClose: stock.prevClose,
      sector: stock.sector,
      signals: [stock.primaryPattern || 'BREAKOUT'],
      signalSummary: stock.primaryPatternLabel,
    });
    setDrawerOpen(true);
  };

  const handleExportCsv = () => {
    if (!report) return;
    const headers = [
      '#',
      'Symbol',
      'Sector',
      'CMP (INR)',
      'Day Change %',
      'Status',
      '52W High (INR)',
      'Distance to 52W %',
      'Primary Pattern',
      'RVOL 20D',
      'VPA Footprint',
      'CLV',
      '52W Proximity Score',
      'Volume Score',
      'Pattern Score',
      'Momentum Score',
      'VPA Modifier',
      'Total Score',
      'Quality Tier',
    ];
    const rows = filteredStocks.map((s, idx) => [
      idx + 1,
      s.symbol,
      s.sector,
      s.close,
      s.changePct,
      s.status,
      s.high52w,
      s.distanceToHighPct,
      s.primaryPatternLabel,
      s.rvol20d !== null ? s.rvol20d : '',
      s.vpaFootprint?.label ?? 'Standard',
      s.clv !== null ? s.clv : '',
      s.scoreBreakdown.proximityScore,
      s.scoreBreakdown.volumeScore,
      s.scoreBreakdown.patternScore,
      s.scoreBreakdown.momentumScore,
      s.scoreBreakdown.vpaModifier,
      s.scoreBreakdown.totalScore,
      s.scoreBreakdown.qualityTier,
    ]);
    const csvContent = generateCsvContent(headers, rows);
    const dateStr = report.date || new Date().toISOString().split('T')[0];
    downloadFile(csvContent, `pattern_breakout_${dateStr}.csv`);
  };

  if (loading && !report) {
    return (
      <div className="min-h-[500px] flex items-center justify-center p-8 bg-bg-primary text-text-primary">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-accent-blue border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-text-secondary text-xs font-medium">
            Scanning 52W High Patterns (Cup &amp; Handle, VCP, Flat Base, Double Bottom)...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8 bg-bg-primary text-text-primary">
        <div className="bg-bg-secondary border border-accent-red/30 rounded-lg p-6 max-w-md text-center space-y-3">
          <h2 className="text-sm font-bold text-accent-red uppercase tracking-wider">
            Pattern Scanner Error
          </h2>
          <p className="text-text-secondary text-xs">{error}</p>
          <button
            type="button"
            onClick={() => fetchReport(true)}
            className="px-3.5 py-1.5 bg-accent-red hover:bg-accent-red/90 text-white font-semibold rounded-md text-xs transition-colors"
          >
            Retry Scan
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-4 font-mono select-none">
      {/* Pending Precompute Banner */}
      {report.status === 'pending' && (
        <div className="flex items-center gap-2 rounded-lg border border-accent-amber/40 bg-accent-amber/10 px-4 py-2 text-xs font-semibold text-accent-amber">
          <span>⏳</span>
          Not yet computed for today — the 19:15 IST precompute job hasn&apos;t run yet, or the cache is cold after a restart. This isn&apos;t a &quot;no breakouts&quot; result; check back shortly.
        </div>
      )}

      {/* Rescanning Banner */}
      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-xs font-semibold text-accent-blue animate-pulse">
          <RefreshCw size={13} className="animate-spin" />
          <span>Rescanning 52W High chart patterns across EQ universe... Please wait.</span>
        </div>
      )}

      {/* ── Workstation Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-accent-amber/10 text-accent-amber">
              <Zap size={18} />
            </span>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              52W High Pattern Breakouts
            </h1>
            <span className="text-[10px] bg-accent-amber/10 text-accent-amber border border-accent-amber/30 px-2 py-0.5 rounded font-semibold uppercase">
              O&apos;Neil &amp; Minervini Engine
            </span>
            <span className="text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-2 py-0.5 rounded font-semibold uppercase">
              {report.date}
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Detects stocks at or near 52-week highs with classical institutional chart patterns (VCP, Cup &amp; Handle, Flat Base, Double Bottom) and 20D Volume confirmation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportActions onExportCsv={handleExportCsv} disabled={filteredStocks.length === 0} />
          <button
            type="button"
            onClick={handleRefresh}
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
              Total Scanned
            </span>
            <span className="text-[8px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">EQ SERIES</span>
          </div>
          <div className="text-2xl font-bold text-text-primary mt-1">
            {report.totalScanned}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">History Depth: {report.tradingDaysAvailable} days</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Activity size={11} className="text-accent-green" />
              Breakout Candidates
            </span>
            <span className="text-[8px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">≥ 52W HIGH</span>
          </div>
          <div className="text-2xl font-bold text-accent-green mt-1">
            {report.countsByStatus.BREAKOUT}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Close ≥ 52W High (1 PRECEDING)</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Zap size={11} className="text-accent-amber" />
              Near 52W High
            </span>
            <span className="text-[8px] bg-accent-amber/10 text-accent-amber font-bold px-1 rounded">WITHIN -5%</span>
          </div>
          <div className="text-2xl font-bold text-accent-amber mt-1">
            {report.countsByStatus.NEAR_HIGH}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Consolidating below 52W pivot</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Award size={11} className="text-accent-purple" />
              A+ Setups (Score 85+)
            </span>
            <span className="text-[8px] bg-accent-purple/10 text-accent-purple font-bold px-1 rounded">ELITE</span>
          </div>
          <div className="text-2xl font-bold text-accent-purple mt-1">
            {report.countsByTier['A+']}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">High-conviction Pattern + RVOL</div>
        </div>
      </div>

      {/* ── Filters & Controls Bar ── */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-primary pb-3">
          {/* Pattern Filter Chips */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-text-tertiary uppercase font-semibold mr-1 flex items-center gap-1">
              <Sliders size={11} />
              Pattern:
            </span>
            <button
              type="button"
              onClick={() => setSelectedPattern('ALL')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                selectedPattern === 'ALL'
                  ? 'bg-accent-blue text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              All ({report.stocks.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedPattern('FLAG_POLE')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                selectedPattern === 'FLAG_POLE'
                  ? 'bg-accent-blue text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              🚩 Bull Flag ({report.countsByPattern.FLAG_POLE ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setSelectedPattern('VCP')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                selectedPattern === 'VCP'
                  ? 'bg-accent-purple text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              VCP ({report.countsByPattern.VCP})
            </button>
            <button
              type="button"
              onClick={() => setSelectedPattern('CUP_AND_HANDLE')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                selectedPattern === 'CUP_AND_HANDLE'
                  ? 'bg-accent-green text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              Cup &amp; Handle ({report.countsByPattern.CUP_AND_HANDLE})
            </button>
            <button
              type="button"
              onClick={() => setSelectedPattern('FLAT_BASE')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                selectedPattern === 'FLAT_BASE'
                  ? 'bg-accent-amber text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              Flat Base ({report.countsByPattern.FLAT_BASE})
            </button>
            <button
              type="button"
              onClick={() => setSelectedPattern('DOUBLE_BOTTOM')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                selectedPattern === 'DOUBLE_BOTTOM'
                  ? 'bg-accent-purple text-white shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              Double Bottom ({report.countsByPattern.DOUBLE_BOTTOM})
            </button>
            <button
              type="button"
              onClick={() => setSelectedPattern('NONE')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                selectedPattern === 'NONE'
                  ? 'bg-bg-primary text-text-primary shadow-sm border border-border-primary'
                  : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
              }`}
            >
              Raw 52W ({report.countsByPattern.NONE})
            </button>
          </div>
        </div>

        {/* Secondary Row: Trade-Ready toggle, Status, Tier, Sector, Search, Density */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTradeReadyOnly((v) => !v)}
              title="Tier A/A+ · RVOL ≥ 1.75x · real chart pattern (excludes Raw 52W High) · ETF/liquid-fund symbols filtered out"
              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors border ${
                tradeReadyOnly
                  ? 'bg-accent-green text-white border-accent-green shadow-sm'
                  : 'bg-bg-tertiary text-text-secondary border-border-primary hover:text-text-primary'
              }`}
            >
              ⚡ Trade-Ready Only
            </button>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as BreakoutStatus | 'ALL')}
              className="bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-accent-blue"
            >
              <option value="ALL">All Statuses</option>
              <option value="BREAKOUT">Breakout (≥ 52W)</option>
              <option value="NEAR_HIGH">Near High (-5% to 0%)</option>
            </select>

            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value as 'A+' | 'A' | 'B' | 'C' | 'ALL')}
              className="bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-accent-blue"
            >
              <option value="ALL">All Tiers</option>
              <option value="A+">Tier A+ (85+)</option>
              <option value="A">Tier A (70-84)</option>
              <option value="B">Tier B (50-69)</option>
            </select>

            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-bg-tertiary border border-border-primary text-text-primary rounded-md px-2.5 py-1 text-xs focus:outline-none focus:border-accent-blue"
            >
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All Sectors' : s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search symbol / sector..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-bg-tertiary border border-border-primary rounded px-2.5 py-1 pl-7 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue w-36 sm:w-48"
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
      </div>

      {/* ── Main Pattern Table (Enterprise Table) ── */}
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
                <th className="py-2 px-3 font-semibold text-center">Status</th>
                <th className="py-2 px-3 font-semibold text-right">52W High (₹)</th>
                <th className="py-2 px-3 font-semibold text-right">Dist to 52W</th>
                <th className="py-2 px-3 font-semibold text-center">Primary Pattern</th>
                <th className="py-2 px-3 font-semibold text-right">RVOL 20D</th>
                <th className="py-2 px-3 font-semibold text-center">VPA Footprint</th>
                <th className="py-2 px-3 font-semibold text-center">Score</th>
                <th className="py-2 px-3 font-semibold text-center">Tier</th>
                <th className="py-2 px-3 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary/40">
              {filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-text-tertiary">
                    No stocks match the selected pattern, status, or search filters.
                  </td>
                </tr>
              ) : (
                filteredStocks.map((stock, idx) => {
                  const isExpanded = expandedSymbol === stock.symbol;
                  const vpa = stock.vpaFootprint;
                  const rowPad = density === 'compact' ? 'py-1.5 px-3' : 'py-2.5 px-3';
                  const isPositive = stock.changePct >= 0;

                  return (
                    <React.Fragment key={stock.symbol}>
                      <tr className="hover:bg-bg-tertiary/40 transition-colors">
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
                        <td className={`${rowPad} text-right font-mono font-bold text-text-primary`}>
                          ₹{stock.close.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td
                          className={`${rowPad} text-right font-mono font-bold ${
                            isPositive ? 'text-accent-green' : 'text-accent-red'
                          }`}
                        >
                          {isPositive ? `+${stock.changePct}%` : `${stock.changePct}%`}
                        </td>
                        <td className={`${rowPad} text-center`}>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                              stock.status === 'BREAKOUT'
                                ? 'bg-accent-green/10 text-accent-green border-accent-green/30'
                                : 'bg-accent-amber/10 text-accent-amber border-accent-amber/30'
                            }`}
                          >
                            {stock.status === 'BREAKOUT' ? 'BREAKOUT' : 'NEAR HIGH'}
                          </span>
                        </td>
                        <td className={`${rowPad} text-right font-mono text-text-secondary`}>
                          ₹{stock.high52w.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td
                          className={`${rowPad} text-right font-mono font-bold ${
                            stock.distanceToHighPct >= 0 ? 'text-accent-green' : 'text-accent-amber'
                          }`}
                        >
                          {stock.distanceToHighPct >= 0
                            ? `+${stock.distanceToHighPct}%`
                            : `${stock.distanceToHighPct}%`}
                        </td>
                        <td className={`${rowPad} text-center whitespace-nowrap`}>
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${getPatternBadgeStyle(
                              stock.primaryPattern
                            )}`}
                          >
                            {stock.primaryPatternLabel}
                          </span>
                        </td>
                        <td className={`${rowPad} text-right font-mono`}>
                          {stock.rvol20d !== null ? (
                            <span
                              className={`font-bold ${
                                stock.rvol20d >= 2.0
                                  ? 'text-accent-green'
                                  : stock.rvol20d >= 1.2
                                  ? 'text-accent-blue'
                                  : 'text-text-secondary'
                              }`}
                            >
                              {stock.rvol20d}x
                            </span>
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className={`${rowPad} text-center whitespace-nowrap`}>
                          {vpa ? (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                vpa.badgeVariant === 'success'
                                  ? 'bg-accent-green/10 text-accent-green border-accent-green/30'
                                  : vpa.badgeVariant === 'info'
                                  ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/30'
                                  : vpa.badgeVariant === 'danger'
                                  ? 'bg-accent-red/10 text-accent-red border-accent-red/30'
                                  : vpa.badgeVariant === 'warning'
                                  ? 'bg-accent-amber/10 text-accent-amber border-accent-amber/30'
                                  : 'bg-bg-tertiary text-text-tertiary border-border-primary'
                              }`}
                              title={vpa.description}
                            >
                              {vpa.label}
                            </span>
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className={`${rowPad} text-center font-mono font-bold text-text-primary`}>
                          {stock.scoreBreakdown.totalScore}
                        </td>
                        <td className={`${rowPad} text-center`}>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getTierBadgeStyle(
                              stock.scoreBreakdown.qualityTier
                            )}`}
                          >
                            {stock.scoreBreakdown.qualityTier}
                          </span>
                        </td>
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

                      {/* Expandable Row Detail */}
                      {isExpanded && (
                        <tr className="bg-bg-primary/90 border-b border-border-primary">
                          <td colSpan={14} className="p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {/* Pattern Details */}
                              <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 space-y-2">
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                                  Pattern Structural Breakdown
                                </h4>
                                {stock.patternDetails ? (
                                  <div className="space-y-1 text-xs">
                                    <p className="text-text-primary">
                                      <strong>Pattern:</strong> {stock.primaryPatternLabel}
                                    </p>
                                    <p className="text-text-secondary">{stock.patternDetails.description}</p>
                                    <div className="flex gap-4 text-text-tertiary font-mono text-[10px] pt-1">
                                      <span>Base Depth: {stock.patternDetails.baseDepthPct}%</span>
                                      <span>Duration: {stock.patternDetails.baseDays} days</span>
                                      <span>Confidence: {stock.patternDetails.confidence}%</span>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-text-tertiary">
                                    No classical consolidation base detected. This is a momentum price breakout into 52W High territory.
                                  </p>
                                )}
                              </div>

                              {/* VPA Footprint Details */}
                              <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 space-y-2">
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                                  Volume Price Analysis (VPA)
                                </h4>
                                {vpa ? (
                                  <div className="space-y-1.5 text-xs">
                                    <div className="flex items-center justify-between">
                                      <span className="text-text-tertiary">Footprint Signal:</span>
                                      <span className="font-bold text-text-primary">{vpa.label}</span>
                                    </div>
                                    <p className="text-text-secondary text-[11px]">{vpa.description}</p>
                                    <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono text-[10px]">
                                      <div className="bg-bg-tertiary p-1.5 rounded border border-border-primary">
                                        <div className="text-text-tertiary">CLV</div>
                                        <div className="font-bold text-text-primary">{stock.clv !== null ? stock.clv : '—'}</div>
                                      </div>
                                      <div className="bg-bg-tertiary p-1.5 rounded border border-border-primary">
                                        <div className="text-text-tertiary">RVOL 20D</div>
                                        <div className="font-bold text-text-primary">{stock.rvol20d !== null ? `${stock.rvol20d}x` : '—'}</div>
                                      </div>
                                      <div className="bg-bg-tertiary p-1.5 rounded border border-border-primary">
                                        <div className="text-text-tertiary">VPA Score</div>
                                        <div className={`font-bold ${stock.scoreBreakdown.vpaModifier >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                                          {stock.scoreBreakdown.vpaModifier > 0 ? `+${stock.scoreBreakdown.vpaModifier}` : stock.scoreBreakdown.vpaModifier} pts
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-text-tertiary">No VPA footprint available for this setup.</p>
                                )}
                              </div>

                              {/* Score Breakdown */}
                              <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 space-y-2">
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                                  Score Breakdown (Total: {stock.scoreBreakdown.totalScore} / 100)
                                </h4>
                                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                                  <div className="bg-bg-tertiary p-2 rounded border border-border-primary">
                                    <div className="text-text-tertiary text-[9px]">52W Proximity</div>
                                    <div className="text-text-primary font-bold font-mono">
                                      {stock.scoreBreakdown.proximityScore} / 30
                                    </div>
                                  </div>
                                  <div className="bg-bg-tertiary p-2 rounded border border-border-primary">
                                    <div className="text-text-tertiary text-[9px]">Volume RVOL</div>
                                    <div className="text-text-primary font-bold font-mono">
                                      {stock.scoreBreakdown.volumeScore} / 25
                                    </div>
                                  </div>
                                  <div className="bg-bg-tertiary p-2 rounded border border-border-primary">
                                    <div className="text-text-tertiary text-[9px]">Pattern Quality</div>
                                    <div className="text-text-primary font-bold font-mono">
                                      {stock.scoreBreakdown.patternScore} / 25
                                    </div>
                                  </div>
                                  <div className="bg-bg-tertiary p-2 rounded border border-border-primary">
                                    <div className="text-text-tertiary text-[9px]">Momentum &amp; MA</div>
                                    <div className="text-text-primary font-bold font-mono">
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

      {/* Stock Detail Drawer Integration */}
      <StockDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        stock={drawerStock}
      />
    </div>
  );
}

function getPatternBadgeStyle(pattern: PatternType): string {
  switch (pattern) {
    case 'FLAG_POLE':
      return 'bg-accent-blue/10 text-accent-blue border border-accent-blue/30';
    case 'VCP':
      return 'bg-accent-purple/10 text-accent-purple border border-accent-purple/30';
    case 'CUP_AND_HANDLE':
      return 'bg-accent-green/10 text-accent-green border border-accent-green/30';
    case 'FLAT_BASE':
      return 'bg-accent-amber/10 text-accent-amber border border-accent-amber/30';
    case 'DOUBLE_BOTTOM':
      return 'bg-accent-purple/10 text-accent-purple border border-accent-purple/30';
    default:
      return 'bg-bg-tertiary text-text-tertiary border border-border-primary';
  }
}

function getTierBadgeStyle(tier: 'A+' | 'A' | 'B' | 'C'): string {
  switch (tier) {
    case 'A+':
      return 'bg-accent-green/10 text-accent-green border border-accent-green/30';
    case 'A':
      return 'bg-accent-blue/10 text-accent-blue border border-accent-blue/30';
    case 'B':
      return 'bg-accent-amber/10 text-accent-amber border border-accent-amber/30';
    default:
      return 'bg-bg-tertiary text-text-tertiary border border-border-primary';
  }
}
