'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutGrid,
  RefreshCw,
  BarChart2,
  ShieldAlert,
  Layers,
  Activity,
  Award,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { registerCacheClearHandler } from '@/lib/navigation-cache';

interface HeatmapItem {
  sector: string;
  signals: Record<string, number>;
}

// Cache to prevent loading spinner on navigation
let _cachedHeatmap: HeatmapItem[] | null = null;

registerCacheClearHandler(() => {
  _cachedHeatmap = null;
});

const TRACKED_SIGNALS = [
  'BULLISH',
  'BEARISH',
  'NARROW',
  'WIDE',
  'BREAKOUT',
  'LONG_BUILD',
  'SHORT_BUILD',
  'VOLUME_SPIKE',
] as const;

export default function HeatmapPage() {
  const [heatmapData, setHeatmapData] = useState<HeatmapItem[]>(() => _cachedHeatmap || []);
  const [loading, setLoading] = useState<boolean>(() => !_cachedHeatmap);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const { showToast } = useToast();

  // Sync state to memory cache
  useEffect(() => {
    if (heatmapData.length > 0) {
      _cachedHeatmap = heatmapData;
    }
  }, [heatmapData]);

  const fetchHeatmap = useCallback(async (isRefreshCall = false) => {
    if (isRefreshCall) setIsRefreshing(true);
    else if (!_cachedHeatmap) setLoading(true);

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

  const maxCount = useMemo(() => {
    return Math.max(
      1,
      ...heatmapData.flatMap((item) =>
        Object.entries(item.signals)
          .filter(([key]) => TRACKED_SIGNALS.includes(key as (typeof TRACKED_SIGNALS)[number]))
          .map(([, val]) => val)
      )
    );
  }, [heatmapData]);

  const totalActiveSignals = useMemo(() => {
    return heatmapData.reduce((acc, item) => {
      return acc + TRACKED_SIGNALS.reduce((sum, sig) => sum + (item.signals[sig] || 0), 0);
    }, 0);
  }, [heatmapData]);

  const dominantSector = useMemo(() => {
    if (!heatmapData.length) return '—';
    let bestSector = '—';
    let maxSignals = -1;
    for (const item of heatmapData) {
      const sum = TRACKED_SIGNALS.reduce((s, sig) => s + (item.signals[sig] || 0), 0);
      if (sum > maxSignals) {
        maxSignals = sum;
        bestSector = item.sector;
      }
    }
    return bestSector;
  }, [heatmapData]);

  const totalNarrow = useMemo(() => {
    return heatmapData.reduce((acc, item) => acc + (item.signals['NARROW'] || 0), 0);
  }, [heatmapData]);

  return (
    <div className="space-y-4 font-mono select-none text-xs">
      {/* ── Workstation Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="p-1.5 rounded-md bg-accent-blue/10 text-accent-blue shrink-0">
              <LayoutGrid size={18} />
            </span>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Sector Confluence Heatmap
            </h1>
            <span className="text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-2 py-0.5 rounded font-semibold uppercase shrink-0">
              Quant Signal Matrix
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Real-time signal density and capital rotation matrix across industrial sectors.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchHeatmap(true)}
            disabled={isRefreshing}
            className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white font-semibold rounded-md text-xs transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Top KPI Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Layers size={11} className="text-accent-blue" />
              Tracked Sectors
            </span>
            <span className="text-[8px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">NSE</span>
          </div>
          <div className="text-2xl font-bold text-text-primary mt-1">
            {heatmapData.length}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Industrial Sectors Tracked</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Activity size={11} className="text-accent-blue" />
              Active Signals
            </span>
            <span className="text-[8px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">SIGNALS</span>
          </div>
          <div className="text-2xl font-bold text-accent-blue mt-1">
            {totalActiveSignals}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Across 8 Quant Signals</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Award size={11} className="text-accent-green" />
              Dominant Sector
            </span>
            <span className="text-[8px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">LEADER</span>
          </div>
          <div className="text-xl font-bold text-accent-green mt-1 truncate" title={dominantSector}>
            {dominantSector}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Highest Signal Concentration</div>
        </div>

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Zap size={11} className="text-accent-amber" />
              CPR Compressions
            </span>
            <span className="text-[8px] bg-accent-amber/10 text-accent-amber font-bold px-1 rounded">NARROW</span>
          </div>
          <div className="text-2xl font-bold text-accent-amber mt-1">
            {totalNarrow}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Volatility Compression Count</div>
        </div>
      </div>

      {/* ── Control / Legend Board ── */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-accent-blue/10 p-1.5 rounded-md border border-accent-blue/20 text-accent-blue">
            <BarChart2 size={14} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-text-primary uppercase">Confluence Density</h2>
            <p className="text-[10px] text-text-tertiary hidden sm:block">
              Cell color saturation reflects signal concentration ratio relative to peak density.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-text-secondary">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-green/60" />
            <span>Bullish / Breakout</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-red/60" />
            <span>Bearish / Distribution</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-blue/60" />
            <span>Volatility / Volume</span>
          </div>
        </div>
      </div>

      {/* ── Heatmap Grid Matrix (Enterprise Table) ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-bg-secondary border border-border-primary rounded-lg">
          <div className="h-8 w-8 rounded-full border-2 border-accent-blue border-t-transparent animate-spin mb-3" />
          <span className="text-xs text-text-tertiary">Loading heatmap matrix...</span>
        </div>
      ) : heatmapData.length === 0 ? (
        <Card className="bg-bg-secondary border-border-primary p-8 text-center max-w-md mx-auto">
          <ShieldAlert size={36} className="mx-auto text-text-tertiary mb-3" />
          <h3 className="text-xs font-bold text-text-primary uppercase">No Scanner Records Found</h3>
          <p className="text-[11px] text-text-secondary mt-1">
            Perform a full scanner run on the main Scanner terminal to populate sector distribution statistics.
          </p>
        </Card>
      ) : (
        <div className="bg-bg-secondary border border-border-primary rounded-lg overflow-hidden">
          {/* Mobile scroll hint */}
          <div className="sm:hidden flex items-center justify-between px-3 py-2 bg-bg-tertiary border-b border-border-primary text-[9px] text-text-secondary uppercase tracking-wider">
            <span>← Scroll horizontally →</span>
            <span>{heatmapData.length} sectors</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse select-none whitespace-nowrap font-mono" style={{ minWidth: 560 }}>
              <thead>
                <tr className="border-b border-border-primary bg-bg-tertiary text-text-secondary text-[9px] uppercase tracking-wider">
                  <th className="py-2 px-3 w-[120px] sm:w-[200px] sticky left-0 bg-bg-tertiary z-10 font-semibold border-r border-border-primary">
                    Sector
                  </th>
                  {TRACKED_SIGNALS.map((sig) => (
                    <th key={sig} className="py-2 px-3 text-center text-[9px] font-bold tracking-wide">
                      {sig.replace('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary/40">
                {heatmapData.map((item, rowIdx) => (
                  <motion.tr
                    key={item.sector}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: rowIdx * 0.02 }}
                    className="hover:bg-bg-tertiary/40 transition-colors"
                  >
                    {/* Sticky sector name */}
                    <td className="py-2 px-3 font-bold text-text-primary border-r border-border-primary bg-bg-secondary sticky left-0 z-10 text-[10px] sm:text-xs">
                      <span className="block truncate max-w-[110px] sm:max-w-none" title={item.sector}>
                        {item.sector}
                      </span>
                    </td>

                    {TRACKED_SIGNALS.map((sig) => {
                      const count = item.signals[sig] || 0;
                      const ratio = count / maxCount;

                      const isBullish = sig === 'BULLISH' || sig === 'BREAKOUT' || sig === 'LONG_BUILD';
                      const isBearish = sig === 'BEARISH' || sig === 'SHORT_BUILD';

                      let style: React.CSSProperties = {};

                      if (count > 0) {
                        if (isBullish) {
                          style = {
                            backgroundColor: `rgba(16, 185, 129, ${0.12 + ratio * 0.70})`,
                            color: ratio > 0.4 ? '#ffffff' : 'var(--color-accent-green, #10b981)',
                            fontWeight: 'bold',
                          };
                        } else if (isBearish) {
                          style = {
                            backgroundColor: `rgba(239, 68, 68, ${0.12 + ratio * 0.70})`,
                            color: ratio > 0.4 ? '#ffffff' : 'var(--color-accent-red, #ef4444)',
                            fontWeight: 'bold',
                          };
                        } else {
                          style = {
                            backgroundColor: `rgba(59, 130, 246, ${0.12 + ratio * 0.70})`,
                            color: ratio > 0.4 ? '#ffffff' : 'var(--color-accent-blue, #3b82f6)',
                            fontWeight: 'bold',
                          };
                        }
                      }

                      return (
                        <td
                          key={sig}
                          className="py-2 px-3 text-center text-xs transition-colors border border-border-primary/30"
                          style={style}
                        >
                          <span className={count > 0 ? 'block font-semibold' : 'text-text-tertiary opacity-30 font-normal'}>
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
