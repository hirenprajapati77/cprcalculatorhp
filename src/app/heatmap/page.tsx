'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, Sparkles, RefreshCw, BarChart2, ShieldAlert, Award } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
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

  // Calculate highest count value to scale cell brightness dynamically
  const maxCount = Math.max(
    1,
    ...heatmapData.flatMap((item) =>
      Object.entries(item.signals)
        .filter(([key]) => trackedSignals.includes(key))
        .map(([, val]) => val)
    )
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-6 font-mono text-xs">
      {/* Title Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl relative overflow-hidden select-none">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <LayoutGrid size={120} className="text-blue-500 rotate-12" />
        </div>
        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
          <LayoutGrid size={13} className="text-blue-400" />
          Quant Signal Heatmap
        </span>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white uppercase mt-1">
          Sector Confluence Heatmap
        </h1>
        <p className="text-[11px] text-slate-400 max-w-2xl leading-relaxed mt-2">
          Visualize real-time signal density and value migration vectors. Identify capital rotations and volatility compressions across distinct industrial sectors.
        </p>
      </div>

      {/* Control Board */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-blue-500/10 p-2 rounded-lg border border-blue-500/20">
            <BarChart2 size={16} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase">Confluence Density</h2>
            <p className="text-[10px] text-slate-400">Cell intensity indicates signal concentration ratios.</p>
          </div>
        </div>

        <button
          onClick={() => fetchHeatmap(true)}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-white border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors h-9"
        >
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          Refresh Heatmap
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse select-none">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[10px] uppercase">
                  <th className="p-4 w-[200px]">Sector Domain</th>
                  {trackedSignals.map((sig) => (
                    <th key={sig} className="p-4 text-center text-[9px] font-bold tracking-wide">
                      {sig.replace('_', '\n')}
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
                    transition={{ delay: rowIdx * 0.05 }}
                    className="hover:bg-slate-800/10 text-slate-300"
                  >
                    {/* Sector Name */}
                    <td className="p-4 font-bold text-white border-r border-slate-800 bg-slate-950/20">
                      {item.sector}
                    </td>

                    {/* Signal Cells */}
                    {trackedSignals.map((sig) => {
                      const count = item.signals[sig] || 0;
                      const ratio = count / maxCount;
                      
                      // Color schemes based on signal classification
                      const isBullish = sig === 'BULLISH' || sig === 'BREAKOUT' || sig === 'LONG_BUILD';
                      const isBearish = sig === 'BEARISH' || sig === 'SHORT_BUILD';
                      
                      // Calculate opacity/brightness color
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
                          // Compressions or spikes (blue/amber)
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
                          className={`p-4 text-center text-xs transition-all ${cellClass}`}
                          style={style}
                        >
                          <span className={count > 0 ? 'scale-110 block font-semibold' : 'opacity-40'}>
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
