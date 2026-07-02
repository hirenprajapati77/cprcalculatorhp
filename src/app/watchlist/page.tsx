'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Star, Pin, Bell, Trash2, Search, Plus, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { fmt } from '@/utils/format';

interface WatchlistItem {
  id: string;
  symbol: string;
  pinned: boolean;
  notify: boolean;
  score?: number;
  ltp?: number;
  width?: number;
  classification?: string;
  signals?: string[];
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchSymbol, setSearchSymbol] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const { showToast } = useToast();

  // Fetch watchlist items and enrich with live scan results
  const fetchWatchlist = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch symbols from database
      const resList = await fetch('/api/watchlist');
      if (!resList.ok) throw new Error('Failed to fetch watchlist');
      const dict: Record<string, { pinned?: boolean; notify?: boolean }> = await resList.json();
      
      const dbList: WatchlistItem[] = Object.entries(dict).map(([symbol, flags], index) => ({
        id: String(index),
        symbol,
        pinned: flags.pinned || false,
        notify: flags.notify || false,
      }));

      if (dbList.length === 0) {
        setWatchlist([]);
        setLoading(false);
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6">
      {/* Title Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl relative overflow-hidden select-none">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Star size={120} className="text-yellow-400 rotate-12" />
        </div>
        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest flex items-center gap-1.5 font-mono">
          <Star size={13} className="fill-blue-400" />
          Quant Terminal Watchlist
        </span>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white uppercase mt-1">
          Discovery Watchlist
        </h1>
        <p className="text-xs md:text-sm text-slate-400 max-w-2xl leading-relaxed mt-2">
          Monitor your high-conviction setups. Pin priority stock discovery signals, toggle breakout notifications, and track live CPR metrics.
        </p>
      </div>

      {/* Control Board */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-blue-500/10 p-2 rounded-lg border border-blue-500/20">
            <TrendingUp size={14} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white font-mono">Monitor Basket</h2>
            <p className="text-[10px] text-slate-400 font-mono">Total tracked: {watchlist.length}</p>
          </div>
        </div>

        <form onSubmit={handleAddSymbol} className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <input
              type="text"
              placeholder="Add symbol (e.g. INFY)..."
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
              disabled={isAdding}
              className="bg-slate-950 border border-slate-800 text-white pl-8 pr-3 py-2 rounded-lg text-xs focus:outline-none focus:border-blue-500 w-full sm:w-[200px] font-mono"
            />
            <Search size={12} className="absolute left-2.5 top-3 text-slate-500" />
          </div>
          <Button type="submit" size="sm" variant="primary" disabled={isAdding} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg h-9 shrink-0">
            <Plus size={13} /> Add
          </Button>
        </form>
      </div>

      {/* Watchlist Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 font-mono">
          <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-4" />
          <span className="text-xs text-slate-400">Fetching watchlist data...</span>
        </div>
      ) : watchlist.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800 p-8 text-center max-w-md mx-auto">
          <Star size={40} className="mx-auto text-slate-700 mb-3" />
          <h3 className="text-sm font-bold text-white font-mono uppercase">Your Watchlist is Empty</h3>
          <p className="text-xs text-slate-500 font-mono mt-1 leading-relaxed">
            Search and add symbols above, or star them directly in the Discovery Scanner.
          </p>
        </Card>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden space-y-2">
            <AnimatePresence initial={false}>
              {watchlist.map((item) => (
                <motion.div
                  key={item.symbol}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-3 font-mono"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-sm">{item.symbol}</span>
                    <div className="flex items-center gap-2">
                      {item.score !== undefined && (
                        <span className={`text-xs font-bold ${
                          item.score >= 90 ? 'text-emerald-400' :
                          item.score >= 70 ? 'text-blue-400' :
                          item.score >= 50 ? 'text-amber-500' : 'text-slate-500'
                        }`}>{item.score}</span>
                      )}
                      <button onClick={() => handleRemoveSymbol(item.symbol)}
                        className="text-slate-600 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition-all">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                    {item.ltp && <span className="text-white font-semibold">₹{fmt(item.ltp)}</span>}
                    {item.width !== undefined && <span>{item.width.toFixed(2)}% width</span>}
                    {item.classification && (
                      <Badge variant={item.classification === 'NARROW' ? 'amber' : item.classification === 'WIDE' ? 'red' : 'blue'}>
                        {item.classification}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex flex-wrap gap-1">
                      {item.signals?.slice(0, 3).map((sig) => (
                        <span key={sig} className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-slate-800 border border-slate-700 text-slate-400 uppercase">{sig}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleToggleState(item.symbol, 'pinned', !item.pinned)}
                        className={`${item.pinned ? 'text-blue-400' : 'text-slate-600'} transition-colors`}>
                        <Pin size={13} className={item.pinned ? 'fill-blue-400' : ''} />
                      </button>
                      <button onClick={() => handleToggleState(item.symbol, 'notify', !item.notify)}
                        className={`${item.notify ? 'text-yellow-500' : 'text-slate-600'} transition-colors`}>
                        <Bell size={13} className={item.notify ? 'fill-yellow-500' : ''} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Desktop table view */}
          <div className="hidden sm:block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs select-none">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[10px] uppercase">
                    <th className="p-4 w-[50px] text-center">Pin</th>
                    <th className="p-4 w-[50px] text-center">Alert</th>
                    <th className="p-4">Symbol</th>
                    <th className="p-4">LTP</th>
                    <th className="p-4">CPR Width</th>
                    <th className="p-4">CPR Class</th>
                    <th className="p-4">Signals</th>
                    <th className="p-4 text-center">Score</th>
                    <th className="p-4 text-center w-[60px]">Del</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <AnimatePresence initial={false}>
                    {watchlist.map((item) => (
                      <motion.tr
                        key={item.symbol}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="hover:bg-slate-800/20 text-slate-300"
                      >
                        <td className="p-4 text-center">
                          <button type="button" onClick={() => handleToggleState(item.symbol, 'pinned', !item.pinned)}
                            className={`hover:scale-110 transition-transform ${item.pinned ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}>
                            <Pin size={14} className={item.pinned ? 'fill-blue-400' : ''} />
                          </button>
                        </td>
                        <td className="p-4 text-center">
                          <button type="button" onClick={() => handleToggleState(item.symbol, 'notify', !item.notify)}
                            className={`hover:scale-110 transition-transform ${item.notify ? 'text-yellow-500' : 'text-slate-600 hover:text-slate-400'}`}>
                            <Bell size={14} className={item.notify ? 'fill-yellow-500' : ''} />
                          </button>
                        </td>
                        <td className="p-4 font-bold text-white text-sm">{item.symbol}</td>
                        <td className="p-4 font-semibold">
                          {item.ltp ? <span className="text-white">₹{fmt(item.ltp)}</span> : <span className="text-slate-600">Pending</span>}
                        </td>
                        <td className="p-4 text-slate-300">{item.width !== undefined ? `${item.width.toFixed(3)}%` : '-'}</td>
                        <td className="p-4">
                          {item.classification ? (
                            <Badge variant={item.classification === 'NARROW' ? 'amber' : item.classification === 'WIDE' ? 'red' : 'blue'}>
                              {item.classification}
                            </Badge>
                          ) : '-'}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {item.signals && item.signals.length > 0 ? (
                              item.signals.slice(0, 3).map((sig) => {
                                const isBullish = sig === 'BULLISH' || sig === 'BREAKOUT' || sig === 'LONG_BUILD';
                                const isBearish = sig === 'BEARISH' || sig === 'SHORT_BUILD';
                                return (
                                  <span key={sig} className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide border ${
                                    isBullish ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                    isBearish ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                    'bg-slate-800 border-slate-700 text-slate-400'
                                  }`}>{sig}</span>
                                );
                              })
                            ) : <span className="text-[10px] text-slate-600 italic">No triggers</span>}
                          </div>
                        </td>
                        <td className="p-4 text-center font-bold">
                          {item.score !== undefined ? (
                            <span className={`${
                              item.score >= 90 ? 'text-emerald-400 text-sm' :
                              item.score >= 70 ? 'text-blue-400' :
                              item.score >= 50 ? 'text-amber-500' : 'text-slate-500'
                            }`}>{item.score}</span>
                          ) : '-'}
                        </td>
                        <td className="p-4 text-center">
                          <button type="button" onClick={() => handleRemoveSymbol(item.symbol)}
                            className="text-slate-600 hover:text-rose-400 hover:scale-110 transition-transform p-1 rounded hover:bg-rose-500/10">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
