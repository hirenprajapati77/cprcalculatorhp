'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Columns, CheckSquare, Plus, X, Search, Sparkles, HelpCircle } from 'lucide-react';
import { SessionCompareChart } from '@/components/chart/SessionCompareChart';
import { MultiStockCompareChart } from '@/components/chart/MultiStockCompareChart';
import { CalculationRecord } from '@/types/cpr.types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { fmt } from '@/utils/format';

interface StockHistoryRecord {
  date: string;
  ltp: number;
  width: number;
  score: number;
}

interface StockCompareData {
  symbol: string;
  sector: string;
  history: StockHistoryRecord[];
  current: {
    ltp: number;
    price: number;
    width: number;
    score: number;
    classification: string;
    signal: string;
  };
}

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  // Selected Stock List
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [stocksData, setStocksData] = useState<StockCompareData[]>([]);
  const [searchSymbol, setSearchSymbol] = useState<string>('');
  const [isFetchingStock, setIsFetchingStock] = useState<boolean>(false);

  // Manual Calculator History (Fallback Mode)
  const [manualHistory, setManualHistory] = useState<CalculationRecord[]>([]);

  // Parse symbols from query params on mount
  useEffect(() => {
    const symbolsParam = searchParams.get('symbols');
    if (symbolsParam) {
      const parsed = symbolsParam
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);
      setSelectedSymbols(parsed);
    }
  }, [searchParams]);

  // Load calculator history for fallback mode
  useEffect(() => {
    const raw = localStorage.getItem('cpr_history') || '[]';
    try {
      const parsed: CalculationRecord[] = JSON.parse(raw);
      setManualHistory(
        parsed.map((item) => ({
          ...item,
          createdAt: new Date(item.createdAt),
        }))
      );
    } catch (err) {
      console.error('Failed to load manual history for compare:', err);
    }
  }, []);

  // Fetch comparison data for selected symbols
  const fetchCompareData = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) {
      setStocksData([]);
      return;
    }

    setIsFetchingStock(true);
    try {
      const fetchedData: StockCompareData[] = [];
      
      for (const sym of symbols) {
        const res = await fetch(`/api/stock/${sym}`);
        if (res.ok) {
          const data = await res.json();
          fetchedData.push({
            symbol: sym,
            sector: data.sector,
            current: {
              ltp: data.current.ltp,
              price: data.current.price,
              width: data.current.width,
              score: data.current.score,
              classification: data.current.classification,
              signal: data.current.signal,
            },
            history: data.history.map((h: { date: string; ltp: number; width: number; score: number }) => ({
              date: h.date,
              ltp: h.ltp,
              width: h.width,
              score: h.score,
            })),
          });
        }
      }
      setStocksData(fetchedData);
    } catch (err) {
      console.error('Error fetching compare details:', err);
    } finally {
      setIsFetchingStock(false);
    }
  }, []);

  useEffect(() => {
    fetchCompareData(selectedSymbols);
  }, [selectedSymbols, fetchCompareData]);

  // Update URL Query Params when symbols change
  const updateQueryParams = (symbols: string[]) => {
    if (symbols.length === 0) {
      router.push('/compare');
    } else {
      router.push(`/compare?symbols=${symbols.join(',')}`);
    }
  };

  // Add Stock to compare list
  const handleAddSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSym = searchSymbol.trim().toUpperCase();
    if (!cleanSym) return;

    if (selectedSymbols.includes(cleanSym)) {
      showToast(`${cleanSym} is already in comparison list`, 'info');
      setSearchSymbol('');
      return;
    }

    setIsFetchingStock(true);
    try {
      const res = await fetch(`/api/stock/${cleanSym}`);
      if (!res.ok) {
        showToast(`Stock symbol ${cleanSym} not found in scan results. Verify scanning data.`, 'error');
      } else {
        const updated = [...selectedSymbols, cleanSym];
        setSelectedSymbols(updated);
        updateQueryParams(updated);
        showToast(`${cleanSym} added for overlay analysis`, 'success');
        setSearchSymbol('');
      }
    } catch {
      showToast('Connection error while fetching symbol info', 'error');
    } finally {
      setIsFetchingStock(false);
    }
  };

  // Remove Stock from compare list
  const handleRemoveSymbol = (symbol: string) => {
    const updated = selectedSymbols.filter((s) => s !== symbol);
    setSelectedSymbols(updated);
    updateQueryParams(updated);
    showToast(`${symbol} removed`, 'info');
  };

  const loadPresetGroup = (symbols: string[]) => {
    setSelectedSymbols(symbols);
    updateQueryParams(symbols);
    showToast('Loaded preset comparative basket', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-5 font-mono select-none">
        <span className="text-[10px] text-accent-blue font-bold uppercase tracking-widest flex items-center gap-1.5">
          <Columns size={13} />
          Quant Overlay Terminal
        </span>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary uppercase mt-1">
          CPR Overlay Analysis
        </h1>
        <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
          Compare CPR properties, price movement profiles, width compression ratios, and directional scoring ranks across multiple active symbols simultaneously.
        </p>
      </div>

      {/* Select Stocks Control Board */}
      <div className="bg-bg-secondary/40 border border-border-primary rounded-lg p-4 font-mono text-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="font-semibold text-text-primary flex items-center gap-1.5">
              <Sparkles size={14} className="text-accent-blue" />
              Comparative Basket Selection
            </span>
            <p className="text-[10px] text-text-tertiary">
              Add up to 5 Nifty symbols to overlay price channels, CPR compression trends, and algorithmic signal ranks.
            </p>
          </div>
          
          <form onSubmit={handleAddSymbol} className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Enter stock symbol (e.g. TCS)..."
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value)}
                disabled={isFetchingStock}
                className="bg-bg-secondary border border-border-secondary text-text-primary pl-8 pr-3 py-1.5 rounded focus:outline-none focus:border-accent-blue w-[220px]"
              />
              <Search size={13} className="absolute left-2.5 top-2.5 text-text-tertiary" />
            </div>
            <Button type="submit" size="sm" variant="primary" disabled={isFetchingStock}>
              <Plus size={13} /> Add
            </Button>
          </form>
        </div>

        {/* Selected Stocks Badges */}
        {selectedSymbols.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-primary/50">
            <span className="text-[10px] text-text-tertiary uppercase mr-1">Active Basket:</span>
            {selectedSymbols.map((sym) => (
              <Badge key={sym} variant="blue" className="pl-2 pr-1 py-1 flex items-center gap-1.5">
                {sym}
                <button
                  type="button"
                  onClick={() => handleRemoveSymbol(sym)}
                  className="hover:bg-accent-blue/30 rounded-full p-0.5"
                >
                  <X size={10} />
                </button>
              </Badge>
            ))}
            <button
              onClick={() => {
                setSelectedSymbols([]);
                updateQueryParams([]);
              }}
              className="text-[10px] text-accent-red font-bold hover:underline ml-2"
            >
              Clear Basket
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-primary/50">
            <span className="text-[10px] text-text-tertiary uppercase mr-1">Load Presets:</span>
            <Button
              onClick={() => loadPresetGroup(['RELIANCE', 'HDFCBANK', 'ICICIBANK'])}
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-[9px]"
            >
              Finance Giants
            </Button>
            <Button
              onClick={() => loadPresetGroup(['TCS', 'INFY', 'WIPRO'])}
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-[9px]"
            >
              IT Leaders
            </Button>
            <Button
              onClick={() => loadPresetGroup(['TMPV', 'M&M'])}
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-[9px]"
            >
              Auto Giants
            </Button>
          </div>
        )}
      </div>

      {selectedSymbols.length > 0 ? (
        /* MULTI-STOCK OVERLAY MODE */
        <div className="space-y-6">
          {/* Multi-Stock Trend Chart */}
          <div className="animate-fade-in">
            <MultiStockCompareChart stocks={stocksData} />
          </div>

          {/* Comparative Properties Table */}
          {stocksData.length > 0 && (
            <Card title="Structural Comparison Matrix" icon={<Columns size={14} className="text-accent-blue" />}>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse font-mono text-xs select-none whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border-primary bg-bg-secondary/50 text-text-secondary text-[10px] uppercase">
                      <th className="p-3">Symbol</th>
                      <th className="p-3">Sector</th>
                      <th className="p-3">LTP / Price</th>
                      <th className="p-3">CPR Width</th>
                      <th className="p-3">CPR Class</th>
                      <th className="p-3">Active Signals</th>
                      <th className="p-3 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-primary/50">
                    {stocksData.map((stock) => {
                      const change = stock.current.ltp - stock.current.price;
                      const pct = (change / stock.current.price) * 100;
                      return (
                        <tr key={stock.symbol} className="hover:bg-bg-tertiary/20">
                          <td className="p-3 font-bold text-text-primary">{stock.symbol}</td>
                          <td className="p-3 text-text-secondary">{stock.sector}</td>
                          <td className="p-3 font-semibold">
                            <span className="text-text-primary">₹{fmt(stock.current.ltp)}</span>
                            <span className={`block text-[9px] font-bold ${change >= 0 ? 'text-accent-green' : 'text-accent-red'} mt-0.5`}>
                              {change >= 0 ? '+' : ''}{pct.toFixed(2)}%
                            </span>
                          </td>
                          <td className="p-3 text-text-primary font-medium">{stock.current.width.toFixed(3)}%</td>
                          <td className="p-3">
                            <Badge variant={stock.current.classification === 'NARROW' ? 'amber' : stock.current.classification === 'WIDE' ? 'red' : 'blue'}>
                              {stock.current.classification}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {stock.current.signal.split(',').slice(0, 3).map((sig) => (
                                <span key={sig} className="text-[8px] bg-bg-tertiary px-1 py-0.5 rounded text-text-secondary">
                                  {sig}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-right font-bold text-accent-blue">{stock.current.score}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      ) : (
        /* FALLBACK MODE: CONSECUTIVE CALCULATOR SESSION OVERLAYS */
        <div className="space-y-6 animate-fade-in">
          {/* Comparison Line Chart */}
          <div>
            <SessionCompareChart records={manualHistory} />
          </div>

          {/* Helper Legend / Info */}
          {manualHistory.length >= 2 ? (
            <div className="bg-bg-secondary/40 border border-border-primary rounded-lg p-4 font-mono text-xs space-y-2.5">
              <span className="font-semibold text-text-primary flex items-center gap-1.5">
                <CheckSquare size={14} className="text-accent-blue" />
                Traders Insight: Session Overlay Interpretation
              </span>
              <ul className="list-disc pl-5 space-y-1.5 text-text-secondary leading-relaxed text-[11px]">
                <li>
                  <strong className="text-text-primary">Ascending Pivots:</strong> Consecutive higher pivots suggest a strong bullish trend structure. Intraday support buying at BC or Pivot is favored.
                </li>
                <li>
                  <strong className="text-text-primary">Descending Pivots:</strong> Consecutive lower pivots show a bearish trend structure. Selling rallies near TC or R1 is favored.
                </li>
                <li>
                  <strong className="text-text-primary">Overlapping Pivots:</strong> Pivots clustered closely indicate consolidation. Intraday range-bound strategies fading extremes are highly profitable.
                </li>
                <li>
                  <strong className="text-text-primary">Widening Bands:</strong> If TC-BC spread increases across sessions, volatility is expanding (expect ranges). If narrowing, volatility is contracting (expect breakouts).
                </li>
              </ul>
            </div>
          ) : (
            <div className="bg-bg-secondary/40 border border-border-primary rounded-lg p-4 font-mono text-xs flex items-center gap-2.5">
              <HelpCircle size={15} className="text-text-tertiary" />
              <p className="text-text-secondary">
                No active stock symbols selected. Showing manual calculation sessions from localStorage. (Save at least 2 sessions in the Calculator to view the chart).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CompareClient() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-20 font-mono">
        <div className="h-8 w-8 rounded-full border-2 border-accent-blue border-t-transparent animate-spin mb-4" />
        <span className="text-xs text-text-secondary">Loading comparison layout...</span>
      </div>
    }>
      <CompareContent />
    </Suspense>
  );
}
