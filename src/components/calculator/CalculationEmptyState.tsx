'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Compass, Sparkles, BookOpen, Layers } from 'lucide-react';

export interface CalculationEmptyStateProps {
  onLoadPreset: (preset: { symbol: string; high: number; low: number; close: number }) => void;
}

export const CalculationEmptyState: React.FC<CalculationEmptyStateProps> = ({ onLoadPreset }) => {
  const presets = [
    {
      label: 'NIFTY 50 Sample',
      symbol: 'NIFTY',
      high: 25150.0,
      low: 24920.0,
      close: 25080.0,
      type: 'NARROW (0.36%)',
    },
    {
      label: 'BANKNIFTY Sample',
      symbol: 'BANKNIFTY',
      high: 51800.0,
      low: 51100.0,
      close: 51520.0,
      type: 'NORMAL (0.74%)',
    },
    {
      label: 'RELIANCE Sample',
      symbol: 'RELIANCE',
      high: 2980.0,
      low: 2910.0,
      close: 2935.0,
      type: 'NORMAL (0.61%)',
    },
    {
      label: 'TCS Sample',
      symbol: 'TCS',
      high: 4250.0,
      low: 4120.0,
      close: 4160.0,
      type: 'WIDE (1.15%)',
    },
  ];

  return (
    <div className="space-y-5 font-mono select-none">
      {/* Hero Welcome Card */}
      <Card title="system ready" icon={<Compass size={14} className="text-accent-blue" />}>
        <div className="py-10 px-4 text-center max-w-xl mx-auto space-y-4">
          <div className="inline-flex p-3 rounded-xl bg-accent-blue/10 border border-accent-blue/20 text-accent-blue mb-1">
            <Compass size={32} className="animate-spin-slow" />
          </div>

          <h2 className="text-base md:text-lg font-bold text-text-primary uppercase tracking-tight">
            Institutional Central Pivot Range Terminal
          </h2>

          <p className="text-xs text-text-secondary leading-relaxed">
            Enter previous trading session&apos;s High, Low, and Close to project dynamic Daily, Weekly, and Monthly support/resistance levels, pivot boundaries, and volatility regime.
          </p>

          <div className="pt-2">
            <span className="text-[10px] text-text-tertiary uppercase tracking-widest font-semibold block mb-2">
              Instant 1-Click Market Presets
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {presets.map((preset) => (
                <button
                  key={preset.symbol}
                  type="button"
                  onClick={() => onLoadPreset(preset)}
                  className="p-2.5 rounded bg-bg-secondary hover:bg-bg-tertiary border border-border-primary hover:border-accent-blue/40 text-left transition-all group flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-text-primary group-hover:text-accent-blue flex items-center gap-1.5">
                      <Sparkles size={11} className="text-accent-amber" />
                      {preset.label}
                    </div>
                    <div className="text-[10px] text-text-tertiary mt-0.5">
                      H: {preset.high} &bull; L: {preset.low} &bull; C: {preset.close}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono text-accent-blue bg-accent-blue/10 px-1.5 py-0.5 rounded">
                    Load
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Educational Quantitative Cheat-Sheet Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CPR Formula Architecture */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-border-primary/60">
            <BookOpen size={14} className="text-accent-blue" />
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
              Mathematical Formulations
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            <div className="bg-bg-tertiary/50 p-2 rounded border border-border-primary/50 flex justify-between items-center">
              <span className="text-[11px] font-semibold text-accent-blue">Pivot Point (P)</span>
              <code className="text-[11px] text-text-primary font-bold">(High + Low + Close) / 3</code>
            </div>

            <div className="bg-bg-tertiary/50 p-2 rounded border border-border-primary/50 flex justify-between items-center">
              <span className="text-[11px] font-semibold text-accent-green">Bottom Central (BC)</span>
              <code className="text-[11px] text-text-primary font-bold">(High + Low) / 2</code>
            </div>

            <div className="bg-bg-tertiary/50 p-2 rounded border border-border-primary/50 flex justify-between items-center">
              <span className="text-[11px] font-semibold text-accent-green">Top Central (TC)</span>
              <code className="text-[11px] text-text-primary font-bold">(Pivot - BC) + Pivot</code>
            </div>

            <div className="bg-bg-tertiary/50 p-2 rounded border border-border-primary/50 flex justify-between items-center">
              <span className="text-[11px] font-semibold text-accent-amber">CPR Width %</span>
              <code className="text-[11px] text-text-primary font-bold">|TC - BC| / Pivot &times; 100</code>
            </div>
          </div>
        </div>

        {/* Volatility Regime Breakdown */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-border-primary/60">
            <Layers size={14} className="text-accent-amber" />
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
              Regime Classification Matrix
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            <div className="bg-accent-green/5 border border-accent-green/20 p-2 rounded">
              <div className="flex justify-between items-center mb-0.5">
                <span className="font-bold text-accent-green text-[11px]">NARROW CPR (&lt; 0.50%)</span>
                <span className="text-[9px] uppercase font-semibold text-accent-green">Trending Setup</span>
              </div>
              <p className="text-[10px] text-text-secondary leading-snug">
                Volatility compression preceding large directional expansion. High odds of 100+ pt trends.
              </p>
            </div>

            <div className="bg-accent-amber/5 border border-accent-amber/20 p-2 rounded">
              <div className="flex justify-between items-center mb-0.5">
                <span className="font-bold text-accent-amber text-[11px]">NORMAL CPR (0.50% &ndash; 1.00%)</span>
                <span className="text-[9px] uppercase font-semibold text-accent-amber">Balanced Setup</span>
              </div>
              <p className="text-[10px] text-text-secondary leading-snug">
                Standard two-way rotational market. Respects both CPR edges and outer pivots R1/S1.
              </p>
            </div>

            <div className="bg-accent-red/5 border border-accent-red/20 p-2 rounded">
              <div className="flex justify-between items-center mb-0.5">
                <span className="font-bold text-accent-red text-[11px]">WIDE CPR (&gt; 1.00%)</span>
                <span className="text-[9px] uppercase font-semibold text-accent-red">Range-Bound Setup</span>
              </div>
              <p className="text-[10px] text-text-secondary leading-snug">
                Mean-reverting chop inside central bands. High risk of false breakouts at R1/S1 boundaries.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalculationEmptyState;
