'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Star,
  Pin,
  Bell,
  Trash2,
  Search,
  Plus,
  TrendingUp,
  Layers,
  Sliders,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { fmt } from '@/utils/format';
import { StockDetailDrawer, type DrawerStockData } from '@/components/enterprise/StockDetailDrawer';
import { registerCacheClearHandler } from '@/lib/navigation-cache';

interface WatchlistItem {
  id: string;
  symbol: string;
  pinned: boolean;
  notify: boolean;
  score?: number | undefined;
  ltp?: number | undefined;
  width?: number | undefined;
  classification?: string | undefined;
  signals?: string[] | undefined;
}

// Cache to prevent loading spinner on navigation
let _cachedWatchlist: WatchlistItem[] | null = null;

registerCacheClearHandler(() => {
  _cachedWatchlist = null;
});

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => _cachedWatchlist || []);
  const [loading, setLoading] = useState<boolean>(() => !_cachedWatchlist);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchSymbol, setSearchSymbol] = useState<string>('');
  const [tableFilter, setTableFilter] = useState<'ALL' | 'PINNED' | 'NOTIFY' | 'NARROW'>('ALL');
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const [isAdding, setIsAdding] = useState<boolean>(false);

  // Stock Detail Drawer state
  const [drawerStock, setDrawerStock] = useState<DrawerStockData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { showToast } = useToast();

  const handleOpenDrawer = useCallback((item: WatchlistItem) => {
    setDrawerStock({
      symbol: item.symbol,
      ltp: item.ltp || 0,
      score: item.score,
      width: item.width,
      classification: item.classification,
      signals: item.signals,
    });
    setDrawerOpen(true);
  }, []);

  // Sync state to memory cache
  useEffect(() => {
    if (watchlist.length > 0) {
      _cachedWatchlist = watchlist;
    }
  }, [watchlist]);

  const fetchWatchlist = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    else if (!_cachedWatchlist) setLoading(true);

    try {
      // 1. Fetch symbols from database
      const resList = await fetch('/api/watchlist');
      if (!resList.ok) throw new Error('Failed to fetch watchlist');
      const dict: Record<string, { starred?: boolean; pinned?: boolean; notify?: boolean }> = await resList.json();

      const dbList: WatchlistItem[] = Object.entries(dict).map(([symbol, flags], index) => ({
        id: String(index),
        symbol,
        pinned: flags.pinned || false,
        notify: flags.notify || false,
      }));

      if (dbList.length === 0) {
        setWatchlist([]);
        setLoading(false);
        if (manual) setIsRefreshing(false);
        return;
      }

      // 2. Fetch live metrics from scanner for these symbols
      const resScan = await fetch('/api/scanner?universe=WATCHLIST');
      if (resScan.ok) {
        const dataScan = await resScan.json();
        const scanResults: (Partial<WatchlistItem> & { symbol: string })[] = dataScan.results || [];

        // Map scanned metrics back to the watchlist
        const enriched = dbList.map((item) => {
          const scan = scanResults.find(
            (r) => r.symbol.toUpperCase() === item.symbol.toUpperCase()
          );
          if (scan) {
            return {
              ...item,
              ...(scan.score !== undefined ? { score: scan.score } : {}),
              ...(scan.ltp !== undefined ? { ltp: scan.ltp } : {}),
              ...(scan.width !== undefined ? { width: scan.width } : {}),
              ...(scan.classification !== undefined ? { classification: scan.classification } : {}),
              ...(scan.signals !== undefined ? { signals: scan.signals } : {}),
            } as WatchlistItem;
          }
          return item;
        });
        setWatchlist(enriched);
      } else {
        setWatchlist(dbList);
      }
    } catch (err) {
      console.error('Error fetching watchlist:', err);
      showToast('Failed to load watchlist metrics', 'error');
    } finally {
      setLoading(false);
      if (manual) setIsRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  // Add symbol to watchlist
  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = searchSymbol.trim().toUpperCase();
    if (!sym) return;

    if (watchlist.some((item) => item.symbol === sym)) {
      showToast(`${sym} is already in your watchlist`, 'info');
      setSearchSymbol('');
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym }),
      });

      if (res.ok) {
        showToast(`${sym} added to watchlist successfully`, 'success');
        setSearchSymbol('');
        fetchWatchlist();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to add symbol', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    } finally {
      setIsAdding(false);
    }
  };

  // Remove symbol from watchlist
  const handleRemoveSymbol = async (symbol: string) => {
    try {
      const res = await fetch(`/api/watchlist?symbol=${symbol}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        showToast(`${symbol} removed from watchlist`, 'info');
        setWatchlist((prev) => prev.filter((item) => item.symbol !== symbol));
      } else {
        showToast('Failed to remove symbol', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    }
  };

  // Toggle Pinned or Notify state
  const handleToggleState = async (symbol: string, field: 'pinned' | 'notify', value: boolean) => {
    try {
      const res = await fetch('/api/watchlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, [field]: value }),
      });

      if (res.ok) {
        setWatchlist((prev) =>
          prev.map((item) => (item.symbol === symbol ? { ...item, [field]: value } : item))
        );
        showToast(`${symbol} alert settings updated`, 'success');
      } else {
        showToast('Failed to update settings', 'error');
      }
    } catch {
      showToast('Connection error', 'error');
    }
  };

  // Filtered symbols based on tableFilter and search query
  const filteredWatchlist = useMemo(() => {
    return watchlist.filter((item) => {
      if (tableFilter === 'PINNED' && !item.pinned) return false;
      if (tableFilter === 'NOTIFY' && !item.notify) return false;
      if (tableFilter === 'NARROW' && item.classification !== 'NARROW' && (!item.score || item.score < 70)) {
        return false;
      }
      if (filterQuery.trim()) {
        const q = filterQuery.toLowerCase().trim();
        if (!item.symbol.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [watchlist, tableFilter, filterQuery]);

  const pinnedCount = useMemo(() => watchlist.filter((w) => w.pinned).length, [watchlist]);
  const notifyCount = useMemo(() => watchlist.filter((w) => w.notify).length, [watchlist]);
  const narrowCount = useMemo(
    () => watchlist.filter((w) => w.classification === 'NARROW' || (w.score && w.score >= 70)).length,
    [watchlist]
  );

  return (
    <div className="space-y-4 font-mono select-none text-xs">
      {/* ── Workstation Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-1.5 rounded-md bg-accent-amber/10 text-accent-amber shrink-0">
              <Star size={18} className="fill-accent-amber" />
            </span>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Institutional Discovery Watchlist
            </h1>
            <span className="text-[10px] bg-accent-amber/10 text-accent-amber border border-accent-amber/30 px-2 py-0.5 rounded font-semibold uppercase shrink-0">
              {watchlist.length} Tracked
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Real-time surveillance basket. Monitor high-conviction setups, arm breakout notification triggers, and inspect CPR geometry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Add Form */}
          <form onSubmit={handleAddSymbol} className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <input
                type="text"
                placeholder="Add symbol (e.g. INFY)..."
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                disabled={isAdding}
                className="bg-bg-tertiary border border-border-primary text-text-primary pl-7 pr-2.5 py-1 rounded-md text-[11px] placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue w-36 sm:w-44 h-8"
              />
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            </div>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={isAdding || !searchSymbol.trim()}
              className="bg-accent-blue hover:bg-accent-blue/90 text-white rounded-md h-8 px-2.5 text-[11px] font-bold flex items-center gap-1"
            >
              <Plus size={13} />
              <span>Add</span>
            </Button>
          </form>

          <button
            type="button"
            onClick={() => fetchWatchlist(true)}
            disabled={isRefreshing}
            className="px-3 py-1.5 bg-bg-tertiary hover:bg-bg-secondary text-text-primary border border-border-primary rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 h-8"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Top KPI Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Layers size={11} className="text-accent-blue" />
              Total Tracked
            </span>
            <span className="text-[8px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">BASKET</span>
          </div>
          <div className="text-2xl font-bold text-text-primary mt-1">
            {watchlist.length}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Active Surveillance Symbols</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Pin size={11} className="text-accent-blue" />
              Pinned Priority
            </span>
            <span className="text-[8px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">PINNED</span>
          </div>
          <div className="text-2xl font-bold text-accent-blue mt-1">
            {pinnedCount}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Top-of-Book Priority Symbols</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Bell size={11} className="text-accent-amber" />
              Alerts Armed
            </span>
            <span className="text-[8px] bg-accent-amber/10 text-accent-amber font-bold px-1 rounded">NOTIFY</span>
          </div>
          <div className="text-2xl font-bold text-accent-amber mt-1">
            {notifyCount}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Automated Breakout Push Armed</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <TrendingUp size={11} className="text-accent-green" />
              Narrow Setups
            </span>
            <span className="text-[8px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">CONVICTION</span>
          </div>
          <div className="text-2xl font-bold text-accent-green mt-1">
            {narrowCount}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Narrow CPR / High Score Setups</div>
        </div>
      </div>

      {/* ── Filters & Controls Bar ── */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-text-tertiary uppercase font-semibold mr-1 flex items-center gap-1">
            <Sliders size={11} />
            Filter:
          </span>
          <button
            type="button"
            onClick={() => setTableFilter('ALL')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
              tableFilter === 'ALL'
                ? 'bg-accent-blue text-white shadow-sm'
                : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
            }`}
          >
            All ({watchlist.length})
          </button>
          <button
            type="button"
            onClick={() => setTableFilter('PINNED')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
              tableFilter === 'PINNED'
                ? 'bg-accent-blue text-white shadow-sm'
                : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
            }`}
          >
            <Pin size={10} className="fill-current" />
            <span>Pinned ({pinnedCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setTableFilter('NOTIFY')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
              tableFilter === 'NOTIFY'
                ? 'bg-accent-amber text-white shadow-sm'
                : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
            }`}
          >
            <Bell size={10} className="fill-current" />
            <span>Alerts ({notifyCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setTableFilter('NARROW')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1 ${
              tableFilter === 'NARROW'
                ? 'bg-accent-green text-white shadow-sm'
                : 'bg-bg-tertiary text-text-secondary border border-border-primary hover:text-text-primary'
            }`}
          >
            <TrendingUp size={10} />
            <span>Narrow Setups ({narrowCount})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Table Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search watchlist..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="bg-bg-tertiary border border-border-primary rounded px-2.5 py-1 pl-7 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue w-32 sm:w-44"
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

      {/* ── Main Watchlist Content ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-bg-secondary border border-border-primary rounded-lg font-mono">
          <div className="h-8 w-8 rounded-full border-2 border-accent-blue border-t-transparent animate-spin mb-3" />
          <span className="text-xs text-text-tertiary">Fetching watchlist surveillance data...</span>
        </div>
      ) : watchlist.length === 0 ? (
        <Card className="bg-bg-secondary border-border-primary p-8 text-center max-w-md mx-auto">
          <Star size={36} className="mx-auto text-text-tertiary mb-3 fill-accent-amber/20 text-accent-amber" />
          <h3 className="text-xs font-bold text-text-primary uppercase">Your Watchlist is Empty</h3>
          <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
            Search and add symbols above, or star them directly in the Discovery Scanner to begin monitoring.
          </p>
        </Card>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden space-y-2">
            <AnimatePresence initial={false}>
              {filteredWatchlist.map((item) => (
                <motion.div
                  key={item.symbol}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  className="bg-bg-secondary border border-border-primary rounded-lg p-3 font-mono space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleOpenDrawer(item)}
                      className="font-bold text-text-primary text-sm hover:text-accent-blue transition-colors text-left"
                    >
                      {item.symbol}
                    </button>
                    <div className="flex items-center gap-2">
                      {item.score !== undefined && (
                        <span
                          className={`text-xs font-bold ${
                            item.score >= 90
                              ? 'text-accent-green'
                              : item.score >= 70
                              ? 'text-accent-blue'
                              : item.score >= 50
                              ? 'text-accent-amber'
                              : 'text-text-tertiary'
                          }`}
                        >
                          {item.score}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveSymbol(item.symbol)}
                        className="text-text-tertiary hover:text-accent-red p-1 rounded hover:bg-accent-red/10 transition-colors"
                        title="Remove from Watchlist"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-secondary">
                    {item.ltp && <span className="text-text-primary font-bold">₹{fmt(item.ltp)}</span>}
                    {item.width !== undefined && <span>{item.width.toFixed(2)}% width</span>}
                    {item.classification && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                          item.classification === 'NARROW'
                            ? 'bg-accent-amber/10 text-accent-amber border-accent-amber/30'
                            : item.classification === 'WIDE'
                            ? 'bg-accent-red/10 text-accent-red border-accent-red/30'
                            : 'bg-accent-blue/10 text-accent-blue border-accent-blue/30'
                        }`}
                      >
                        {item.classification}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border-primary/50">
                    <div className="flex flex-wrap gap-1">
                      {item.signals?.slice(0, 3).map((sig) => (
                        <span
                          key={sig}
                          className="text-[8px] px-1 py-0.2 rounded font-bold bg-bg-tertiary border border-border-primary text-text-secondary uppercase"
                        >
                          {sig}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleState(item.symbol, 'pinned', !item.pinned)}
                        className={`${item.pinned ? 'text-accent-blue' : 'text-text-tertiary hover:text-text-primary'} transition-colors`}
                      >
                        <Pin size={13} className={item.pinned ? 'fill-accent-blue' : ''} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleState(item.symbol, 'notify', !item.notify)}
                        className={`${item.notify ? 'text-accent-amber' : 'text-text-tertiary hover:text-text-primary'} transition-colors`}
                      >
                        <Bell size={13} className={item.notify ? 'fill-accent-amber' : ''} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs whitespace-nowrap">
                <thead className="sticky top-0 bg-bg-tertiary text-text-secondary text-[10px] uppercase tracking-wider border-b border-border-primary">
                  <tr>
                    <th className="py-2 px-3 w-[45px] text-center">Pin</th>
                    <th className="py-2 px-3 w-[45px] text-center">Alert</th>
                    <th className="sticky left-0 bg-bg-tertiary py-2 px-3 font-semibold">Symbol</th>
                    <th className="py-2 px-3 font-semibold text-right">LTP (₹)</th>
                    <th className="py-2 px-3 font-semibold text-right">CPR Width</th>
                    <th className="py-2 px-3 font-semibold text-center">Classification</th>
                    <th className="py-2 px-3 font-semibold">Active Signals</th>
                    <th className="py-2 px-3 font-semibold text-center">Score</th>
                    <th className="py-2 px-3 text-center w-[50px]">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary/40">
                  {filteredWatchlist.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-text-tertiary">
                        No watchlist items match the current filter.
                      </td>
                    </tr>
                  ) : (
                    <AnimatePresence initial={false}>
                      {filteredWatchlist.map((item) => {
                        const rowPad = density === 'compact' ? 'py-1.5 px-3' : 'py-2.5 px-3';

                        return (
                          <motion.tr
                            key={item.symbol}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -12 }}
                            className="hover:bg-bg-tertiary/40 text-text-primary transition-colors"
                          >
                            <td className={`${rowPad} text-center`}>
                              <button
                                type="button"
                                onClick={() => handleToggleState(item.symbol, 'pinned', !item.pinned)}
                                className={`transition-transform hover:scale-110 ${
                                  item.pinned ? 'text-accent-blue' : 'text-text-tertiary hover:text-text-primary'
                                }`}
                                title={item.pinned ? 'Unpin symbol' : 'Pin symbol to top'}
                              >
                                <Pin size={13} className={item.pinned ? 'fill-accent-blue' : ''} />
                              </button>
                            </td>

                            <td className={`${rowPad} text-center`}>
                              <button
                                type="button"
                                onClick={() => handleToggleState(item.symbol, 'notify', !item.notify)}
                                className={`transition-transform hover:scale-110 ${
                                  item.notify ? 'text-accent-amber' : 'text-text-tertiary hover:text-text-primary'
                                }`}
                                title={item.notify ? 'Mute breakout alert' : 'Arm breakout alert'}
                              >
                                <Bell size={13} className={item.notify ? 'fill-accent-amber' : ''} />
                              </button>
                            </td>

                            <td className={`sticky left-0 bg-bg-secondary hover:bg-bg-tertiary/40 font-bold text-text-primary ${rowPad}`}>
                              <button
                                type="button"
                                onClick={() => handleOpenDrawer(item)}
                                className="hover:text-accent-blue transition-colors underline decoration-border-secondary text-left font-bold"
                                title="Open Stock Detail Drawer"
                              >
                                {item.symbol}
                              </button>
                            </td>

                            <td className={`${rowPad} text-right font-bold font-mono`}>
                              {item.ltp ? (
                                <span>₹{fmt(item.ltp)}</span>
                              ) : (
                                <span className="text-text-tertiary font-normal">Pending</span>
                              )}
                            </td>

                            <td className={`${rowPad} text-right text-text-secondary font-mono`}>
                              {item.width !== undefined ? `${item.width.toFixed(3)}%` : '—'}
                            </td>

                            <td className={`${rowPad} text-center`}>
                              {item.classification ? (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                    item.classification === 'NARROW'
                                      ? 'bg-accent-amber/10 text-accent-amber border-accent-amber/30'
                                      : item.classification === 'WIDE'
                                      ? 'bg-accent-red/10 text-accent-red border-accent-red/30'
                                      : 'bg-accent-blue/10 text-accent-blue border-accent-blue/30'
                                  }`}
                                >
                                  {item.classification}
                                </span>
                              ) : (
                                <span className="text-text-tertiary">—</span>
                              )}
                            </td>

                            <td className={`${rowPad}`}>
                              <div className="flex flex-wrap gap-1 max-w-[240px]">
                                {item.signals && item.signals.length > 0 ? (
                                  item.signals.slice(0, 3).map((sig) => {
                                    const isBullish =
                                      sig === 'BULLISH' || sig === 'BREAKOUT' || sig === 'LONG_BUILD';
                                    const isBearish = sig === 'BEARISH' || sig === 'SHORT_BUILD';
                                    return (
                                      <span
                                        key={sig}
                                        className={`text-[8px] px-1 py-0.2 rounded font-bold uppercase tracking-wide border ${
                                          isBullish
                                            ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
                                            : isBearish
                                            ? 'bg-accent-red/10 border-accent-red/30 text-accent-red'
                                            : 'bg-bg-tertiary border-border-primary text-text-secondary'
                                        }`}
                                      >
                                        {sig}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-[10px] text-text-tertiary italic">No active signals</span>
                                )}
                              </div>
                            </td>

                            <td className={`${rowPad} text-center font-bold font-mono`}>
                              {item.score !== undefined ? (
                                <span
                                  className={`${
                                    item.score >= 90
                                      ? 'text-accent-green'
                                      : item.score >= 70
                                      ? 'text-accent-blue'
                                      : item.score >= 50
                                      ? 'text-accent-amber'
                                      : 'text-text-tertiary'
                                  }`}
                                >
                                  {item.score}
                                </span>
                              ) : (
                                <span className="text-text-tertiary">—</span>
                              )}
                            </td>

                            <td className={`${rowPad} text-center`}>
                              <button
                                type="button"
                                onClick={() => handleRemoveSymbol(item.symbol)}
                                className="text-text-tertiary hover:text-accent-red hover:scale-110 transition-transform p-1 rounded"
                                title={`Remove ${item.symbol}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Stock Detail Drawer Integration */}
      <StockDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        stock={drawerStock}
        isStarred={true}
        isPinned={Boolean(drawerStock && watchlist.find((w) => w.symbol === drawerStock.symbol)?.pinned)}
        isNotified={Boolean(drawerStock && watchlist.find((w) => w.symbol === drawerStock.symbol)?.notify)}
        onToggleWatchlist={(sym, key) => {
          if (key === 'pinned' || key === 'notify') {
            const current = watchlist.find((w) => w.symbol === sym);
            if (current) {
              handleToggleState(sym, key, !current[key]);
            }
          } else if (key === 'starred') {
            handleRemoveSymbol(sym);
            setDrawerOpen(false);
          }
        }}
      />
    </div>
  );
}
