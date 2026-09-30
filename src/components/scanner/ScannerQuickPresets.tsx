'use client';

import React from 'react';
import { Award, TrendingUp, TrendingDown, Target, RotateCcw } from 'lucide-react';
import type { ScannerMode } from './ScannerKpiStrip';

interface ScannerQuickPresetsProps {
  scannerMode: ScannerMode;
  onSetScannerMode: (mode: ScannerMode) => void;
  minScore: string;
  onSetMinScore: (score: string) => void;
  narrowCprOnly: boolean;
  onToggleNarrowCprOnly: (active: boolean) => void;
  signalMode: string;
  onSetSignalMode: (mode: string) => void;
  onResetFilters?: () => void;
  className?: string;
}

export const ScannerQuickPresets: React.FC<ScannerQuickPresetsProps> = ({
  scannerMode,
  onSetScannerMode,
  minScore,
  onSetMinScore,
  narrowCprOnly,
  onToggleNarrowCprOnly,
  signalMode,
  onSetSignalMode,
  onResetFilters,
  className = '',
}) => {
  const isHighConvictionActive = minScore === '75' || minScore === '100';
  const isBtstActive = scannerMode === 'BTST';
  const isStbtActive = scannerMode === 'STBT';
  const isNarrowCprActive = narrowCprOnly || signalMode === 'NARROW';

  return (
    <div className={`flex flex-wrap items-center gap-2 font-mono text-xs select-none ${className}`}>
      <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider mr-1">
        Quick Views:
      </span>

      {/* Preset: High Conviction (Score >= 75) */}
      <button
        type="button"
        onClick={() => {
          if (isHighConvictionActive) {
            onSetMinScore('');
          } else {
            onSetMinScore(scannerMode === 'CPR' ? '75' : '100');
          }
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
          isHighConvictionActive
            ? 'bg-purple-500/15 border-purple-500/40 text-purple-300 shadow-sm'
            : 'bg-surface-elevated border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
        title="Filter high conviction setups with score ≥ 75"
      >
        <Award size={13} className={isHighConvictionActive ? 'text-purple-400' : 'text-text-muted'} />
        <span>High Conviction</span>
        {isHighConvictionActive && <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />}
      </button>

      {/* Preset: BTST Bullish */}
      <button
        type="button"
        onClick={() => {
          if (isBtstActive) {
            onSetScannerMode('CPR');
          } else {
            onSetScannerMode('BTST');
          }
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
          isBtstActive
            ? 'bg-emerald-500/15 border-emerald-500/40 text-trading-bullish shadow-sm'
            : 'bg-surface-elevated border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
        title="Activate BTST Bullish Overnight Discovery Mode"
      >
        <TrendingUp size={13} className={isBtstActive ? 'text-trading-bullish' : 'text-text-muted'} />
        <span>BTST Bullish</span>
        {isBtstActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
      </button>

      {/* Preset: STBT Bearish */}
      <button
        type="button"
        onClick={() => {
          if (isStbtActive) {
            onSetScannerMode('CPR');
          } else {
            onSetScannerMode('STBT');
          }
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
          isStbtActive
            ? 'bg-rose-500/15 border-rose-500/40 text-trading-bearish shadow-sm'
            : 'bg-surface-elevated border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
        title="Activate STBT Bearish Overnight Discovery Mode"
      >
        <TrendingDown size={13} className={isStbtActive ? 'text-trading-bearish' : 'text-text-muted'} />
        <span>STBT Bearish</span>
        {isStbtActive && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
      </button>

      {/* Preset: Narrow CPR */}
      <button
        type="button"
        onClick={() => {
          if (isNarrowCprActive) {
            onToggleNarrowCprOnly(false);
            if (signalMode === 'NARROW') onSetSignalMode('ALL');
          } else {
            onToggleNarrowCprOnly(true);
            onSetSignalMode('NARROW');
          }
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
          isNarrowCprActive
            ? 'bg-accent-primary/15 border-accent-primary/40 text-accent-primary shadow-sm'
            : 'bg-surface-elevated border-border-default text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
        title="Filter narrow Central Pivot Range compression setups"
      >
        <Target size={13} className={isNarrowCprActive ? 'text-accent-primary' : 'text-text-muted'} />
        <span>Narrow CPR</span>
        {isNarrowCprActive && <span className="h-1.5 w-1.5 rounded-full bg-accent-primary" />}
      </button>

      {/* Reset view if any active */}
      {(isHighConvictionActive || isBtstActive || isStbtActive || isNarrowCprActive) && (
        <button
          type="button"
          onClick={() => {
            onSetScannerMode('CPR');
            onSetMinScore('');
            onToggleNarrowCprOnly(false);
            onSetSignalMode('ALL');
            if (onResetFilters) onResetFilters();
          }}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-text-muted hover:text-text-primary transition-colors ml-auto"
          title="Reset to default view"
        >
          <RotateCcw size={11} />
          <span>Reset Presets</span>
        </button>
      )}
    </div>
  );
};

export default ScannerQuickPresets;
