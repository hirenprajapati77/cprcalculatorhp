'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Star,
  Pin,
  Bell,
  Target,
  Activity,
  Sparkles,
  Maximize2,
  Minimize2,
  ExternalLink,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/Button';
import { LevelChart } from '@/components/chart/LevelChart';
import type { CPRClassification, CPRResult } from '@/types/cpr.types';
import { VpaBreakdownPanel, type VpaBreakdownView } from '@/components/vpa/VpaBreakdownPanel';
import { fmt } from '@/utils/format';
import { isUnscoredSignal } from '@/lib/scanner-rating';

export interface DrawerStockData {
  id?: string | undefined;
  symbol: string;
  ltp: number;
  open?: number | undefined;
  high?: number | undefined;
  low?: number | undefined;
  close?: number | undefined;
  price?: number | undefined;
  previousClose?: number | undefined;
  market?: string | undefined;
  sector?: string | undefined;
  marketCap?: number | undefined;
  score?: number | undefined;
  confidence?: number | undefined;
  classification?: string | undefined;
  direction?: 'LONG' | 'SHORT' | undefined;
  tc?: number | undefined;
  bc?: number | undefined;
  pivot?: number | undefined;
  r1?: number | undefined;
  r2?: number | undefined;
  r3?: number | undefined;
  r4?: number | undefined;
  s1?: number | undefined;
  s2?: number | undefined;
  s3?: number | undefined;
  s4?: number | undefined;
  width?: number | undefined;
  signals?: string[] | undefined;
  signalSummary?: string | undefined;
  entry?: number | undefined;
  target?: number | undefined;
  target2?: number | null | undefined;
  sl?: number | undefined;
  rr?: string | undefined;
  rr2?: string | null | undefined;
  executableRr?: string | undefined;
  rrStatus?: 'EXECUTABLE' | 'POOR_RR' | 'EXTENDED' | 'TARGET_REACHED' | 'INVALIDATED' | 'BLOCKED' | undefined;
  scoreBreakdown?: {
    vdu?: number | string | undefined;
    cprNarrow?: number | string | undefined;
    higherValue?: number | string | undefined;
    vwap?: number | string | undefined;
    liquidity?: number | string | undefined;
    closeStrength?: number | string | undefined;
    trendConfluence?: number | undefined;
    clvScore?: number | undefined;
  } | null | undefined;
  vpaBreakdown?: VpaBreakdownView | null | undefined;
  rejectionReason?: string | null | undefined;
  alertSuppressedReason?: string | null | undefined;
  alertSuppressedDetail?: string | null | undefined;
  optionSuggestion?: {
    symbol?: string | undefined;
    strike?: number | undefined;
    type?: 'CE' | 'PE' | undefined;
    ltp?: number | undefined;
    momentumScore?: number | undefined;
    formattedName?: string | undefined;
    error?: string | undefined;
  } | null | undefined;
}

export type DrawerTab = 'overview' | 'signals' | 'tradeSetup' | 'history' | 'compare' | 'notes' | 'cprStats';

export interface StockDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  stock: DrawerStockData | null;
  isStarred?: boolean | undefined;
  isPinned?: boolean | undefined;
  isNotified?: boolean | undefined;
  onToggleWatchlist?: ((symbol: string, key: 'starred' | 'pinned' | 'notify') => void) | undefined;
  onChartRedirect?: ((stock: DrawerStockData) => void) | undefined;
  scoreMax?: number | undefined;
  scannerMode?: string | undefined;
}

interface CprStatsApiData {
  currentClassification: string;
  currentWidth: number;
  historicalPercentile: number;
  narrowTrendRate: number;
  normalTrendRate: number;
  wideTrendRate: number;
  narrowDays: number;
  normalDays: number;
  wideDays: number;
  avgNarrowWidth?: number | undefined;
}

interface HistoryScanItem {
  id?: string | undefined;
  date: string;
  score: number;
  tag?: string | undefined;
  signalSummary?: string | undefined;
  width?: number | undefined;
  ltp?: number | undefined;
}

interface CompareStockItem {
  symbol: string;
  score?: number | undefined;
  width?: number | undefined;
  direction?: 'LONG' | 'SHORT' | undefined;
  signals?: string[] | undefined;
  rr?: string | undefined;
  ltp?: number | undefined;
}

const SIGNAL_EXPLANATIONS: Record<string, string> = {
  HIGHER_VALUE: "Today CPR is above yesterday's CPR. Bullish value migration.",
  INSIDE_VALUE: "Today CPR is fully inside yesterday's CPR band. Consolidation, await breakout.",
  LOWER_VALUE: "Today CPR below yesterday's CPR. Bearish value migration.",
  OVERLAPPING_VALUE: "Today and yesterday CPR bands partially overlap. Mixed transition zone.",
  OUTSIDE_VALUE: "Today CPR band and yesterday CPR band have no overlap. Divergent value zone.",
  BREAKOUT: 'Heavy volume + price above TC. Strong bullish breakout.',
  NARROW: 'CPR width < 0.3%. High probability trending day ahead.',
  VIRGIN: 'CPR never tested. Strong magnet zone.',
  HOT_ZONE: 'Price within 0.5% of CPR band. High-reaction zone.',
  VOLUME_SPIKE: 'Volume > 2x average. Institutional activity.',
  BULLISH: 'Bias based on price vs yesterday TC/BC level.',
  BEARISH: 'Bias based on price vs yesterday TC/BC level.',
  HP_ASC_CPR: '3 consecutive days of rising CPR. Bullish trend expected.',
  HP_DESC_CPR: '3 consecutive days of falling CPR. Bearish trend expected.',
  HP_INSIDE_CPR: "Today CPR inside yesterday CPR band. Trending continuation setup.",
  HP_RTP: '20 & 50 SMA sloping in the same direction. Running Trend Pattern.',
  HP_HP_RTP: 'High Probability RTP: Price crossing 200 SMA while RTP is active.',
  HP_DIRECT_UP: 'Daily candle closes above R1 with green body. Continuation breakout.',
  HP_DIRECT_DOWN: 'Daily candle closes below S1 with red body. Continuation breakdown.',
};

export const StockDetailDrawer: React.FC<StockDetailDrawerProps> = ({
  isOpen,
  onClose,
  stock,
  isStarred = false,
  isPinned = false,
  isNotified = false,
  onToggleWatchlist,
  onChartRedirect,
  scoreMax = 100,
  scannerMode: _scannerMode = 'CPR',
}) => {
  const router = useRouter();
  const [isExpandedWidth, setIsExpandedWidth] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('overview');

  // Lazy loaded tab data states
  const [historyData, setHistoryData] = useState<HistoryScanItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cprStatsData, setCprStatsData] = useState<CprStatsApiData | null>(null);
  const [cprStatsLoading, setCprStatsLoading] = useState(false);
  const [compareStocks, setCompareStocks] = useState<CompareStockItem[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isNotesSaving, setIsNotesSaving] = useState(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const [vpaData, setVpaData] = useState<VpaBreakdownView | null>(null);
  const [vpaLoading, setVpaLoading] = useState(false);

  // Tab persistence in localStorage
  useEffect(() => {
    try {
      const savedTab = localStorage.getItem('cpr_drawer_tab') as DrawerTab | null;
      if (savedTab) setDrawerTab(savedTab);
    } catch {
      // LocalStorage unavailable
    }
  }, []);

  const handleTabChange = (tab: DrawerTab) => {
    setDrawerTab(tab);
    try {
      localStorage.setItem('cpr_drawer_tab', tab);
    } catch {
      // LocalStorage unavailable
    }
  };

  // Keyboard Esc listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load user notes from localStorage
  useEffect(() => {
    if (!stock || !isOpen) return;
    try {
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const key = `cpr_notes_${stock.symbol}_${dateStr}`;
      const saved = localStorage.getItem(key);
      setNotes(saved || '');
    } catch {
      setNotes('');
    }
  }, [stock, isOpen]);

  // Auto-save notes with debouncing
  useEffect(() => {
    if (!stock || !isOpen || drawerTab !== 'notes') return;

    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const key = `cpr_notes_${stock.symbol}_${dateStr}`;
    const saved = localStorage.getItem(key) || '';

    if (notes === saved) return;

    setIsNotesSaving(true);
    let hideTimer: NodeJS.Timeout | undefined;
    const timeout = setTimeout(() => {
      if (notes.trim()) {
        localStorage.setItem(key, notes);
      } else {
        localStorage.removeItem(key);
      }
      setIsNotesSaving(false);
      setShowSavedIndicator(true);
      hideTimer = setTimeout(() => setShowSavedIndicator(false), 2000);
    }, 500);

    return () => {
      clearTimeout(timeout);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [notes, stock, drawerTab, isOpen]);

  const handleClearNote = () => {
    setNotes('');
    if (!stock) return;
    try {
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      const key = `cpr_notes_${stock.symbol}_${dateStr}`;
      localStorage.removeItem(key);
      setShowSavedIndicator(true);
      setTimeout(() => setShowSavedIndicator(false), 2000);
    } catch {
      // LocalStorage unavailable
    }
  };

  // Lazy-load VPA if missing
  useEffect(() => {
    if (!stock || !isOpen) {
      setVpaData(null);
      return;
    }

    if (stock.vpaBreakdown?.enabled) {
      setVpaData(stock.vpaBreakdown);
      return;
    }

    const dir = stock.direction || (stock.signals?.includes('BEARISH') ? 'SHORT' : 'LONG');
    let mounted = true;
    setVpaLoading(true);

    fetch(`/api/vpa?symbol=${encodeURIComponent(stock.symbol)}&direction=${dir}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.vpa) {
          setVpaData(data.vpa);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setVpaLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [stock, isOpen]);

  // Lazy load history on tab switch
  useEffect(() => {
    if (!stock || !isOpen || drawerTab !== 'history') return;
    if (historyData.length > 0) return;

    let mounted = true;
    setHistoryLoading(true);

    fetch(`/api/scanner/history?symbol=${encodeURIComponent(stock.symbol)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) return;
        const list = Array.isArray(data.history)
          ? data.history
          : Array.isArray(data)
          ? data
          : [];
        setHistoryData(list);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setHistoryLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [stock, isOpen, drawerTab, historyData.length]);

  // Lazy load compare on tab switch
  useEffect(() => {
    if (!stock || !isOpen || drawerTab !== 'compare') return;
    if (compareStocks.length > 0) return;

    let mounted = true;
    setCompareLoading(true);
    setCompareError(null);

    fetch('/api/scanner/top?limit=5')
      .then((res) => {
        if (!res.ok) throw new Error('Compare data unavailable.');
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        setCompareStocks(data.results || []);
      })
      .catch((err) => {
        if (!mounted) return;
        setCompareError(err instanceof Error ? err.message : 'Compare data unavailable.');
      })
      .finally(() => {
        if (mounted) setCompareLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [stock, isOpen, drawerTab, compareStocks.length]);

  // Lazy load CPR stats on tab switch
  useEffect(() => {
    if (!stock || !isOpen || drawerTab !== 'cprStats') return;
    if (cprStatsData) return;

    let mounted = true;
    setCprStatsLoading(true);

    fetch(`/api/cpr-stats?symbol=${encodeURIComponent(stock.symbol)}&lookback=90`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) return;
        setCprStatsData(data);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setCprStatsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [stock, isOpen, drawerTab, cprStatsData]);

  if (!isOpen || !stock) return null;

  const openPrice = stock.previousClose || stock.price || stock.open || stock.ltp;
  const priceDiff = stock.ltp - openPrice;
  const pctDiff = openPrice > 0 ? (priceDiff / openPrice) * 100 : 0;
  const isPositive = pctDiff >= 0;

  const direction = stock.direction || (stock.signals?.includes('BEARISH') ? 'SHORT' : 'LONG');
  const entry = stock.entry || (direction === 'LONG' ? stock.tc || stock.ltp : stock.bc || stock.ltp);
  const target = stock.target || (direction === 'LONG' ? stock.ltp * 1.015 : stock.ltp * 0.985);
  const stopLoss =
    stock.sl || (direction === 'LONG' ? stock.bc || stock.ltp * 0.99 : stock.tc || stock.ltp * 1.01);

  const levelChartRecord: CPRResult & { ltp: number } = {
    pivot: stock.pivot ?? 0,
    bc: stock.bc ?? 0,
    tc: stock.tc ?? 0,
    r1: stock.r1 ?? 0,
    r2: stock.r2 ?? 0,
    r3: stock.r3 ?? 0,
    r4: stock.r4 ?? 0,
    s1: stock.s1 ?? 0,
    s2: stock.s2 ?? 0,
    s3: stock.s3 ?? 0,
    s4: stock.s4 ?? 0,
    width: stock.width ?? 0,
    classification: (stock.classification as CPRClassification) || 'NORMAL',
    trend: 'Trending',
    ltp: stock.ltp,
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-mono select-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Container */}
      <div className="fixed inset-y-0 right-0 max-w-full flex max-sm:bottom-0 max-sm:top-auto max-sm:h-[85vh] max-sm:w-full">
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={`Stock details for ${stock.symbol}`}
          className={`w-screen bg-surface-panel border-l border-border-default shadow-2xl flex flex-col justify-between h-full max-sm:rounded-t-xl overflow-hidden transition-all duration-300 text-text-primary ${
            isExpandedWidth ? 'sm:max-w-[780px]' : 'sm:max-w-[560px]'
          }`}
        >
          {/* ── Sticky Drawer Header ── */}
          <div className="p-4 border-b border-border-default flex items-center justify-between bg-surface-elevated z-10 sticky top-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary flex-shrink-0">
                <Target size={17} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide truncate">
                    {stock.symbol}
                  </h3>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                      direction === 'LONG'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-trading-bullish'
                        : 'bg-rose-500/15 border-rose-500/30 text-trading-bearish'
                    }`}
                  >
                    {direction}
                  </span>
                  {stock.classification && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-app border border-border-subtle text-text-muted">
                      {stock.classification}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-text-muted mt-0.5">
                  <span className="font-bold text-text-primary">₹{fmt(stock.ltp)}</span>
                  <span
                    className={`font-semibold flex items-center ${
                      isPositive ? 'text-trading-bullish' : 'text-trading-bearish'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {pctDiff.toFixed(2)}%
                  </span>
                  {stock.sector && <span>• {stock.sector}</span>}
                </div>
              </div>
            </div>

            {/* Header Action Cluster */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {onToggleWatchlist && (
                <>
                  <button
                    type="button"
                    onClick={() => onToggleWatchlist(stock.symbol, 'starred')}
                    className={`p-1.5 rounded hover:bg-surface-hover transition-colors ${
                      isStarred ? 'text-amber-400' : 'text-text-muted hover:text-text-primary'
                    }`}
                    title={isStarred ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  >
                    <Star size={15} fill={isStarred ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleWatchlist(stock.symbol, 'pinned')}
                    className={`p-1.5 rounded hover:bg-surface-hover transition-colors ${
                      isPinned ? 'text-accent-primary' : 'text-text-muted hover:text-text-primary'
                    }`}
                    title={isPinned ? 'Unpin' : 'Pin to Top'}
                  >
                    <Pin size={15} className={isPinned ? 'fill-accent-primary' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleWatchlist(stock.symbol, 'notify')}
                    className={`p-1.5 rounded hover:bg-surface-hover transition-colors ${
                      isNotified ? 'text-amber-500' : 'text-text-muted hover:text-text-primary'
                    }`}
                    title={isNotified ? 'Alerts Enabled' : 'Enable Alert'}
                  >
                    <Bell size={15} className={isNotified ? 'fill-amber-500' : ''} />
                  </button>
                </>
              )}

              {/* Dual-width expand toggle */}
              <button
                type="button"
                onClick={() => setIsExpandedWidth((prev) => !prev)}
                className="hidden sm:flex p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                title={isExpandedWidth ? 'Compact drawer (560px)' : 'Widescreen drawer (780px)'}
                aria-label="Toggle drawer width"
              >
                {isExpandedWidth ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                aria-label="Close drawer"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* ── Persistent Multi-Tab Navigation Strip ── */}
          <div
            role="tablist"
            aria-label="Stock details sections"
            className="flex border-b border-border-default bg-surface-app text-[10px] uppercase font-bold overflow-x-auto scrollbar-none z-10 sticky top-[65px]"
          >
            {(
              [
                { id: 'overview', label: 'Overview' },
                { id: 'signals', label: 'Signals' },
                { id: 'tradeSetup', label: 'Trade Setup' },
                { id: 'history', label: 'History' },
                { id: 'compare', label: 'Compare' },
                { id: 'notes', label: 'Notes' },
                { id: 'cprStats', label: 'CPR Stats' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={drawerTab === tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`px-3.5 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  drawerTab === tab.id
                    ? 'border-accent-primary text-text-primary bg-surface-panel font-bold'
                    : 'border-transparent text-text-muted hover:text-text-primary hover:bg-surface-hover'
                }`}
              >
                <span>{tab.label}</span>
                {tab.id === 'notes' && notes.trim() && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
                )}
              </button>
            ))}
          </div>

          {/* ── Scrollable Body Content ── */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
            {/* TAB: OVERVIEW */}
            {drawerTab === 'overview' && (
              <div className="space-y-4 animate-fade-in">
                {/* Primary Card */}
                <div className="bg-surface-elevated border border-border-default rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-base font-bold text-text-primary">{stock.symbol}</h4>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {stock.sector || 'NSE Equities'} | {stock.market || 'NSE'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-text-primary block">₹{fmt(stock.ltp)}</span>
                      {stock.marketCap ? (
                        <span className="text-[10px] text-text-muted">
                          Mcap: ₹{stock.marketCap.toLocaleString('en-IN')} Cr
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border-subtle pt-3 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-text-muted">Score Rank:</span>
                      <span className="font-bold text-text-primary">
                        {stock.score ?? '—'} / {scoreMax}
                      </span>
                    </div>
                    {stock.confidence !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-accent-primary">
                          Confluence {stock.confidence}/100
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* CPR Levels Band Card */}
                <div className="bg-surface-elevated border border-border-default rounded-lg p-3.5 space-y-2">
                  <span className="font-bold text-text-primary block text-[11px] uppercase tracking-wider">
                    Central Pivot Range Matrix
                  </span>
                  <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                    <div className="p-2 rounded bg-surface-panel border border-border-subtle">
                      <span className="text-text-muted block">TC Level</span>
                      <span className="font-bold text-text-primary text-xs mt-0.5 block">
                        ₹{fmt(stock.tc ?? 0)}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-surface-panel border border-border-subtle">
                      <span className="text-text-muted block">Pivot Point</span>
                      <span className="font-bold text-accent-primary text-xs mt-0.5 block">
                        ₹{fmt(stock.pivot ?? 0)}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-surface-panel border border-border-subtle">
                      <span className="text-text-muted block">BC Level</span>
                      <span className="font-bold text-text-primary text-xs mt-0.5 block">
                        ₹{fmt(stock.bc ?? 0)}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-surface-panel border border-border-subtle">
                      <span className="text-text-muted block">CPR Width</span>
                      <span className="font-bold text-purple-400 text-xs mt-0.5 block">
                        {stock.width ? `${stock.width.toFixed(3)}%` : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* VPA Confirmation Panel if available */}
                {(vpaData || stock.vpaBreakdown) && (
                  <VpaBreakdownPanel
                    vpa={(vpaData || stock.vpaBreakdown)!}
                    className="mt-2"
                  />
                )}
                {vpaLoading && (
                  <div className="text-center py-2 text-text-muted text-[11px]">Loading VPA breakdown...</div>
                )}

                {/* Visual Level Chart */}
                <div className="space-y-1.5 bg-surface-elevated border border-border-default rounded-lg p-3">
                  <span className="text-[10px] text-text-muted uppercase tracking-wider block font-bold">
                    CPR Band Level Chart
                  </span>
                  <LevelChart record={levelChartRecord} />
                </div>
              </div>
            )}

            {/* TAB: SIGNALS */}
            {drawerTab === 'signals' && (
              <div className="space-y-4 animate-fade-in">
                {/* Confluence Signals List */}
                <div className="bg-surface-elevated border border-border-default rounded-lg p-3.5 space-y-2">
                  <span className="font-bold text-text-primary block text-[11px] uppercase tracking-wider">
                    Active Confluence Signals
                  </span>
                  {stock.signals && stock.signals.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {stock.signals.map((sig) => {
                        const unscored = isUnscoredSignal(sig);
                        return (
                          <span
                            key={sig}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              unscored
                                ? 'bg-surface-app text-text-muted border-border-subtle'
                                : sig === 'BREAKOUT' || sig === 'BULLISH' || sig === 'NARROW'
                                ? 'bg-emerald-500/15 text-trading-bullish border-emerald-500/30'
                                : sig === 'BEARISH' || sig === 'WIDE'
                                ? 'bg-rose-500/15 text-trading-bearish border-rose-500/30'
                                : 'bg-surface-panel text-text-primary border-border-default'
                            }`}
                          >
                            {sig}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-text-muted text-xs">No active signals registered for this session.</p>
                  )}
                </div>

                {/* Signal Glossary / Explanation Card */}
                <div className="bg-surface-elevated border border-border-default rounded-lg p-3.5 space-y-2.5">
                  <span className="font-bold text-text-primary block text-[11px] uppercase tracking-wider">
                    Signal Interpretation Glossary
                  </span>
                  <ul className="space-y-2 text-[11px] text-text-secondary">
                    {(stock.signals || []).map((sig) => {
                      const cleanSig = sig.replace(/^KGS_/, 'HP_');
                      const explanation = SIGNAL_EXPLANATIONS[cleanSig];
                      if (!explanation) return null;
                      return (
                        <li key={sig} className="border-b border-border-subtle pb-1.5 last:border-none">
                          <strong className="text-text-primary font-mono">{cleanSig}:</strong>{' '}
                          <span className="text-text-muted">{explanation}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}

            {/* TAB: TRADE SETUP */}
            {drawerTab === 'tradeSetup' && (
              <div className="space-y-4 animate-fade-in">
                {/* Algorithmic Strategy Card */}
                <div className="bg-surface-elevated border border-border-default rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                    <span className="font-bold text-text-primary text-[11px] uppercase flex items-center gap-1.5">
                      <Sparkles size={13} className="text-accent-primary" />
                      Algorithmic Trade Strategy
                    </span>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                        direction === 'LONG'
                          ? 'bg-emerald-500/15 text-trading-bullish border-emerald-500/30'
                          : 'bg-rose-500/15 text-trading-bearish border-rose-500/30'
                      }`}
                    >
                      {direction} SETUP
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2.5 rounded bg-surface-panel border border-border-subtle">
                      <span className="text-text-muted text-[10px] block uppercase">Entry Threshold</span>
                      <span className="font-bold text-text-primary text-sm mt-0.5 block">
                        ₹{fmt(entry)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded bg-surface-panel border border-border-subtle">
                      <span className="text-text-muted text-[10px] block uppercase">Target Objective</span>
                      <span className="font-bold text-trading-bullish text-sm mt-0.5 block">
                        ₹{fmt(target)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded bg-surface-panel border border-border-subtle">
                      <span className="text-text-muted text-[10px] block uppercase">Stop Loss</span>
                      <span className="font-bold text-trading-bearish text-sm mt-0.5 block">
                        ₹{fmt(stopLoss)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded bg-surface-panel border border-border-subtle">
                      <span className="text-text-muted text-[10px] block uppercase">Model R:R</span>
                      <span className="font-bold text-accent-primary text-sm mt-0.5 block">
                        {stock.rr || '1:2.0'}
                      </span>
                    </div>
                  </div>

                  {stock.executableRr && (
                    <div className="p-2.5 rounded bg-surface-panel border border-border-subtle flex items-center justify-between text-[11px]">
                      <span className="text-text-muted">Executable R:R from LTP:</span>
                      <span className="font-bold text-text-primary">{stock.executableRr}</span>
                    </div>
                  )}
                </div>

                {/* Option suggestion banner if available */}
                {stock.optionSuggestion && (
                  <div className="bg-surface-elevated border border-accent-primary/30 rounded-lg p-3.5 space-y-2">
                    <span className="text-[10px] font-bold text-accent-primary uppercase tracking-wider block">
                      Recommended Derivative Contract
                    </span>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-text-primary">
                        {stock.optionSuggestion.formattedName || stock.optionSuggestion.symbol}
                      </span>
                      <span className="font-mono text-emerald-400 font-bold">
                        ₹{fmt(stock.optionSuggestion.ltp ?? 0)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: HISTORY */}
            {drawerTab === 'history' && (
              <div className="space-y-3 animate-fade-in">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                  Past Scan Encounters (Last 10 Sessions)
                </span>
                {historyLoading ? (
                  <div className="text-center py-8 text-text-muted text-xs">Loading historical records...</div>
                ) : historyData.length === 0 ? (
                  <div className="text-center py-8 text-text-muted text-xs bg-surface-elevated rounded-lg border border-border-subtle">
                    No historical scan records found for this symbol.
                  </div>
                ) : (
                  <div className="border border-border-default rounded-lg overflow-hidden bg-surface-elevated">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border-default bg-surface-panel text-[10px] text-text-muted uppercase">
                          <th className="p-2">Date</th>
                          <th className="p-2 text-right">Score</th>
                          <th className="p-2 text-right">Width</th>
                          <th className="p-2 text-right">Setup</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {historyData.slice(0, 10).map((rec, i) => (
                          <tr key={i} className="hover:bg-surface-hover">
                            <td className="p-2 text-text-primary font-mono">{rec.date}</td>
                            <td className="p-2 text-right font-bold text-accent-primary">{rec.score}</td>
                            <td className="p-2 text-right text-text-muted">
                              {rec.width ? `${rec.width.toFixed(2)}%` : '—'}
                            </td>
                            <td className="p-2 text-right text-text-secondary">{rec.tag || 'CPR'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB: COMPARE */}
            {drawerTab === 'compare' && (
              <div className="space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                    Top 5 Active Scanner Opportunities Comparison
                  </span>
                  <Button
                    onClick={() => {
                      router.push(`/compare?symbols=${stock.symbol}`);
                      onClose();
                    }}
                    variant="ghost"
                    size="sm"
                    className="text-[10px] h-6 px-2 text-accent-primary hover:text-accent-primary/80 gap-1"
                  >
                    <span>Full Compare</span>
                    <ExternalLink size={11} />
                  </Button>
                </div>

                {compareLoading ? (
                  <div className="text-center py-6 text-text-muted text-xs">Loading comparison...</div>
                ) : compareError ? (
                  <div className="text-center py-6 text-trading-bearish text-xs bg-surface-elevated rounded-lg border border-border-subtle">
                    {compareError}
                  </div>
                ) : compareStocks.length === 0 ? (
                  <div className="text-center py-6 text-text-muted text-xs bg-surface-elevated rounded-lg border border-border-subtle">
                    Compare data unavailable.
                  </div>
                ) : (
                  <div className="border border-border-default rounded-lg overflow-x-auto bg-surface-elevated">
                    <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                      <thead>
                        <tr className="bg-surface-panel text-text-muted uppercase border-b border-border-default text-[10px]">
                          <th className="p-2">Symbol</th>
                          <th className="p-2 text-right">Score</th>
                          <th className="p-2 text-right">Width%</th>
                          <th className="p-2 text-center">Bias</th>
                          <th className="p-2 text-right">RR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {(() => {
                          const listToRender: CompareStockItem[] = [...compareStocks];
                          const hasCurrent = listToRender.some((s) => s.symbol === stock.symbol);
                          if (!hasCurrent) {
                            listToRender.unshift({
                              symbol: stock.symbol,
                              score: stock.score,
                              width: stock.width,
                              direction,
                              rr: stock.rr,
                            });
                          }

                          return listToRender.slice(0, 6).map((item) => {
                            const isCurrent = item.symbol === stock.symbol;
                            const bias =
                              item.direction || (item.signals?.includes('BEARISH') ? 'SHORT' : 'LONG');

                            return (
                              <tr
                                key={item.symbol}
                                className={`hover:bg-surface-hover transition-colors ${
                                  isCurrent ? 'bg-accent-primary/10 font-bold border-l-2 border-accent-primary' : ''
                                }`}
                              >
                                <td className="p-2 text-text-primary uppercase flex items-center gap-1.5">
                                  <span>{item.symbol}</span>
                                  {isCurrent && (
                                    <span className="text-[8px] bg-accent-primary/20 text-accent-primary px-1 rounded uppercase font-semibold">
                                      Current
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 text-right text-text-secondary">{item.score ?? '—'}</td>
                                <td className="p-2 text-right text-text-muted">
                                  {item.width ? `${item.width.toFixed(3)}%` : '—'}
                                </td>
                                <td
                                  className={`p-2 text-center font-bold text-[10px] ${
                                    bias === 'LONG' ? 'text-trading-bullish' : 'text-trading-bearish'
                                  }`}
                                >
                                  {bias}
                                </td>
                                <td className="p-2 text-right text-text-secondary font-mono">
                                  {item.rr || '1:2.0'}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB: NOTES */}
            {drawerTab === 'notes' && (
              <div className="space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    Trader Notes &amp; Local Persistence
                  </span>
                  <div className="flex items-center gap-2">
                    {isNotesSaving && (
                      <span className="text-[10px] text-text-muted animate-pulse">Saving...</span>
                    )}
                    {showSavedIndicator && (
                      <span className="text-[10px] text-emerald-400 font-semibold animate-pulse">
                        Auto-saved ✓
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleClearNote}
                      className="text-[10px] text-trading-bearish hover:underline font-bold uppercase transition-all flex items-center gap-1"
                    >
                      <Trash2 size={11} />
                      <span>Clear Note</span>
                    </button>
                  </div>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Record trade thesis, resistance watch levels, volume notes..."
                  rows={8}
                  className="w-full bg-surface-elevated border border-border-default rounded-lg p-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary font-mono resize-none"
                />
                <p className="text-[10px] text-text-muted italic">
                  Notes are saved automatically in your browser localStorage with date-specific keys.
                </p>
              </div>
            )}

            {/* TAB: CPR STATS */}
            {drawerTab === 'cprStats' && (
              <div className="space-y-4 animate-fade-in">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                  CPR Width Historical Stats (90 Days)
                </span>
                {cprStatsLoading ? (
                  <div className="text-center py-8 text-text-muted text-xs">Loading CPR statistics...</div>
                ) : !cprStatsData ? (
                  <div className="text-center py-8 text-text-muted text-xs bg-surface-elevated rounded-lg border border-border-subtle">
                    Data unavailable for {stock.symbol}.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Header Summary */}
                    <div className="bg-surface-elevated border border-border-default rounded-lg p-3.5 text-center space-y-1">
                      <div className="text-sm font-bold text-text-primary uppercase">
                        {cprStatsData.currentClassification} CPR TODAY
                      </div>
                      <div className="text-xs text-text-secondary">
                        Width:{' '}
                        <span className="text-accent-primary font-bold">
                          {cprStatsData.currentWidth.toFixed(3)}%
                        </span>
                        <span className="mx-2">•</span>
                        Percentile:{' '}
                        <span className="text-accent-primary font-bold">
                          {cprStatsData.historicalPercentile}
                        </span>{' '}
                        / 100
                      </div>
                      <div className="text-[10px] text-text-muted mt-2">
                        A NARROW CPR leads to a trending day{' '}
                        <span className="text-trading-bullish font-bold">
                          {cprStatsData.narrowTrendRate.toFixed(1)}%
                        </span>{' '}
                        of the time for {stock.symbol}.
                      </div>
                    </div>

                    {/* Distribution and Trend Rate Visual Charts */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="h-44 border border-border-default bg-surface-elevated rounded-lg p-2.5 flex flex-col">
                        <span className="text-[9px] text-center text-text-muted uppercase font-bold mb-1">
                          CPR Type Distribution
                        </span>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Narrow', value: cprStatsData.narrowDays, color: '#3b82f6' },
                                { name: 'Normal', value: cprStatsData.normalDays, color: '#8b5cf6' },
                                { name: 'Wide', value: cprStatsData.wideDays, color: '#64748b' },
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={25}
                              outerRadius={42}
                              dataKey="value"
                            >
                              <Cell fill="#3b82f6" />
                              <Cell fill="#8b5cf6" />
                              <Cell fill="#64748b" />
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'var(--surface-elevated, #1a1b1e)',
                                borderColor: 'var(--border-default, #2d2e33)',
                                fontSize: 10,
                                padding: 4,
                                color: 'var(--text-primary, #ffffff)',
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="h-44 border border-border-default bg-surface-elevated rounded-lg p-2.5 flex flex-col">
                        <span className="text-[9px] text-center text-text-muted uppercase font-bold mb-1">
                          Trend Rate by CPR Type
                        </span>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              { name: 'Narrow', rate: cprStatsData.narrowTrendRate },
                              { name: 'Normal', rate: cprStatsData.normalTrendRate },
                              { name: 'Wide', rate: cprStatsData.wideTrendRate },
                            ]}
                          >
                            <XAxis
                              dataKey="name"
                              stroke="var(--text-muted, #888888)"
                              fontSize={9}
                              tickLine={false}
                              axisLine={false}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'var(--surface-elevated, #1a1b1e)',
                                borderColor: 'var(--border-default, #2d2e33)',
                                fontSize: 10,
                                padding: 4,
                                color: 'var(--text-primary, #ffffff)',
                              }}
                              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                              formatter={(v) => `${Number(v).toFixed(1)}%`}
                            />
                            <Bar dataKey="rate" fill="#10b981" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Persistent Drawer Footer ── */}
          <div className="p-3 border-t border-border-default bg-surface-elevated flex items-center justify-between text-xs z-10 sticky bottom-0">
            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  router.push(`/calculate?symbol=${stock.symbol}`);
                  onClose();
                }}
                size="sm"
                variant="primary"
                className="font-bold text-xs h-8 gap-1.5"
              >
                <span>Calculate CPR</span>
                <ChevronRight size={13} />
              </Button>
              {onChartRedirect && (
                <Button
                  onClick={() => onChartRedirect(stock)}
                  size="sm"
                  variant="secondary"
                  className="text-xs h-8 gap-1"
                >
                  <Activity size={13} />
                  <span>Chart</span>
                </Button>
              )}
            </div>

            <Button
              onClick={onClose}
              size="sm"
              variant="ghost"
              className="text-xs text-text-muted hover:text-text-primary"
            >
              Close
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default StockDetailDrawer;
