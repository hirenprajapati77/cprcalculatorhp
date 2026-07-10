'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, RefreshCw, BarChart2, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

interface HeatmapItem {
  sector: string;
  signals: Record<string, number>;
}

export default function HeatmapPage() {
  const [heatmapData, setHeatmapData] = useState<HeatmapItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const { showToast } = useToast();

  const fetchHeatmap = useCallback(async (isRefreshCall = false) => {
    if (isRefreshCall) setIsRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch('/api/scanner/heatmap');
      if (!res.ok) throw new Error('Failed to fetch heatmap data');
      const data = await res.json();
      setHeatmapData(data.heatmap || []);
      if (isRefreshCall) showToast('Heatmap data updated successfully', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to load structural heatmap matrix', 'error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchHeatmap();
  }, [fetchHeatmap]);

  const trackedSignals = [
    'BULLISH',
    'BEARISH',
    'NARROW',
    'WIDE',
    'BREAKOUT',
    'LONG_BUILD',
    'SHORT_BUILD',
    'VOLUME_SPIKE',
  ];

  const maxCount = Math.max(
    1,
    ...heatmapData.flatMap((item) =>
      Object.entries(item.signals)
        .filter(([key]) => trackedSignals.includes(key))
        .map(([, val]) => val)
    )
  );

  return (
    <div className="space-y-4 max-w-6xl mx-auto font-mono text-xs">
      {/* Title Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-6 shadow-2xl relative overflow-hidden select-none">
        <div className="absolute top-0 right-0 p-6 opacity-10 hidden sm:block">
          <LayoutGrid size={100} className="text-blue-500 rotate-12" />
        </div>
        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
          <LayoutGrid size={12} className="text-blue-400" />
          Quant Signal Heatmap
        </span>
        <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-white uppercase mt-1">
          Sector Confluence Heatmap
        </h1>
        <p className="text-[11px] text-slate-400 max-w-2xl leading-relaxed mt-2 hidden sm:block">
          Visualize real-time signal density across industrial sectors. Identify capital rotations and volatility compressions.
        </p>
      </div>

      {/* Control Board */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-blue-500/10 p-2 rounded-lg border border-blue-500/20">
            <BarChart2 size={14} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase">Confluence Density</h2>
            <p className="text-[10px] text-slate-400 hidden sm:block">Cell intensity indicates signal concentration ratios.</p>
          </div>
        </div>

        <button
          onClick={() => fetchHeatmap(true)}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-white border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors h-8"
        >
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Heatmap Grid Matrix */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-4" />
          <span className="text-xs text-slate-400">Loading heatmap matrix...</span>
        </div>
      ) : heatmapData.length === 0 ? (
        <Card className="bg-slate-900 border-slate-800 p-8 text-center max-w-md mx-auto">
          <ShieldAlert size={40} className="mx-auto text-slate-700 mb-3" />
          <h3 className="text-sm font-bold text-white uppercase">No Scanner Records Found</h3>
          <p className="text-xs text-slate-500 mt-1">
            Perform a full scanner run on the main Scanner terminal to populate sector distribution statistics.
          </p>
        </Card>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
          {/* Mobile scroll hint */}
          <div className="sm:hidden flex items-center justify-between px-3 py-2 bg-slate-950/60 border-b border-slate-800 text-[9px] text-slate-500 uppercase tracking-wider">
            <span>← Scroll horizontally →</span>
            <span>{heatmapData.length} sectors</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse select-none whitespace-nowrap" style={{ minWidth: 560 }}>
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[9px] uppercase">
                  <th className="p-2 sm:p-4 w-[110px] sm:w-[200px] sticky left-0 bg-slate-950 z-10">Sector</th>
                  {trackedSignals.map((sig) => (
                    <th key={sig} className="p-2 sm:p-4 text-center text-[8px] sm:text-[9px] font-bold tracking-wide whitespace-nowrap">
                      {sig.replace('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {heatmapData.map((item, rowIdx) => (
                  <motion.tr
                    key={item.sector}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: rowIdx * 0.04 }}
                    className="hover:bg-slate-800/10 text-slate-300"
                  >
                    {/* Sticky sector name on mobile */}
                    <td className="p-2 sm:p-4 font-bold text-white border-r border-slate-800 bg-slate-950/80 sticky left-0 z-10 text-[10px] sm:text-xs">
                      <span className="block truncate max-w-[100px] sm:max-w-none" title={item.sector}>
                        {item.sector}
                      </span>
                    </td>

                    {trackedSignals.map((sig) => {
                      const count = item.signals[sig] || 0;
                      const ratio = count / maxCount;

                      const isBullish = sig === 'BULLISH' || sig === 'BREAKOUT' || sig === 'LONG_BUILD';
                      const isBearish = sig === 'BEARISH' || sig === 'SHORT_BUILD';

                      const cellClass = 'bg-slate-950/40 text-slate-600 border border-slate-900/40';
                      let style: React.CSSProperties = {};

                      if (count > 0) {
                        if (isBullish) {
                          style = {
                            backgroundColor: `rgba(16, 185, 129, ${0.1 + ratio * 0.75})`,
                            color: ratio > 0.5 ? '#ffffff' : '#a7f3d0',
                            fontWeight: 'bold',
                          };
                        } else if (isBearish) {
                          style = {
                            backgroundColor: `rgba(239, 68, 68, ${0.1 + ratio * 0.75})`,
                            color: ratio > 0.5 ? '#ffffff' : '#fecaca',
                            fontWeight: 'bold',
                          };
                        } else {
                          style = {
                            backgroundColor: `rgba(59, 130, 246, ${0.1 + ratio * 0.75})`,
                            color: ratio > 0.5 ? '#ffffff' : '#bfdbfe',
                            fontWeight: 'bold',
                          };
                        }
                      }

                      return (
                        <td
                          key={sig}
                          className={`p-2 sm:p-4 text-center text-xs transition-all ${cellClass}`}
                          style={style}
                        >
                          <span className={count > 0 ? 'block font-semibold' : 'opacity-40'}>
                            {count}
                          </span>
                        </td>
                      );
                    })}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
