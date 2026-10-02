'use client';

import React from 'react';
import { CPRClassification, CPRTrend } from '@/types/cpr.types';
import { formatPct, fmt } from '@/utils/format';
import {
  Activity,
  Zap,
  ShieldAlert,
  Sliders,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Info,
} from 'lucide-react';

export interface CPRInterpretationProps {
  classification: CPRClassification;
  trend: CPRTrend;
  width: number;
  pivot: number;
  tc: number;
  bc: number;
  close?: number | undefined;
  confluence?: {
    strongSupport: number[];
    strongResistance: number[];
  } | undefined;
}

export const CPRInterpretation: React.FC<CPRInterpretationProps> = ({
  classification,
  trend,
  width,
  pivot,
  tc,
  bc,
  close,
  confluence,
}) => {
  // Relative progress calculation against a 1.5% reference ceiling
  const widthFillPct = Math.min((width / 1.5) * 100, 100);

  // Directional placement of close relative to CPR
  const getPositioning = () => {
    if (close === undefined) return null;
    const upper = Math.max(tc, bc);
    const lower = Math.min(tc, bc);

    if (close > upper) {
      return {
        label: 'Bullish (Above CPR)',
        desc: `Close (₹${fmt(close)}) settled above TC (₹${fmt(upper)}). Buyers absorbed selling pressure into the close. Expect bullish continuation or shallow retest of TC as support.`,
        color: 'text-accent-green',
        bg: 'bg-accent-green/10 border-accent-green/20',
        icon: <TrendingUp size={14} className="text-accent-green" />,
      };
    }
    if (close < lower) {
      return {
        label: 'Bearish (Below CPR)',
        desc: `Close (₹${fmt(close)}) settled below BC (₹${fmt(lower)}). Sellers drove price below key floor. Expect downward momentum or shallow pullback into BC as resistance.`,
        color: 'text-accent-red',
        bg: 'bg-accent-red/10 border-accent-red/20',
        icon: <TrendingDown size={14} className="text-accent-red" />,
      };
    }
    return {
      label: 'Neutral (Inside CPR Band)',
      desc: `Close (₹${fmt(close)}) is pinned between BC (₹${fmt(lower)}) and TC (₹${fmt(upper)}). Market is in price discovery equilibrium. Wait for decisive 15m breakout bar above TC or breakdown below BC.`,
      color: 'text-accent-amber',
      bg: 'bg-accent-amber/10 border-accent-amber/20',
      icon: <Activity size={14} className="text-accent-amber" />,
    };
  };

  const positioning = getPositioning();

  const playbook = {
    NARROW: {
      headline: 'High-Conviction Breakout / Trend Continuation',
      tactics: [
        'Volatility Compression Alert: Bands are narrow, signaling energy buildup and imminent trend expansion.',
        'Primary Entry: Favor aggressive breakout trading above R1 or breakdown below S1 with volume confirmation.',
        'Avoid Counter-Trend Fading: Mean reversion setups have a high failure rate on narrow CPR days.',
        'Trailing Strategy: Ride the trend with 9 EMA or Supertrend trailing stop-losses.',
      ],
      badgeColor: 'text-accent-green bg-accent-green/10 border-accent-green/20',
    },
    NORMAL: {
      headline: 'Balanced Two-Way Auction',
      tactics: [
        'Rotational Market: Price often respects both CPR boundaries and outer pivot thresholds.',
        'Support/Resistance Play: Look for price rejection candles near TC/BC for mean-reversion toward Pivot.',
        'Breakout Confirmation: Require at least 2 consecutive 5-minute candles outside R1/S1 before entering directional trades.',
        'Target Expectation: Take partial profits at R1/S1; full targets at R2/S2.',
      ],
      badgeColor: 'text-accent-amber bg-accent-amber/10 border-accent-amber/20',
    },
    WIDE: {
      headline: 'Mean-Reverting Range-Bound Choppiness',
      tactics: [
        'Sideways Regime Warning: Broad CPR acts as a strong absorption magnet, preventing sustained trend runs.',
        'Fade Extremes: Sell near R1/R2 and buy near S1/S2 after rejection wicks form.',
        'No-Chase Rule: Breakout attempts above R1 or below S1 have >70% historical failure rate in wide CPR regimes.',
        'Quick Scaling: Take rapid profits inside the central band (TC to BC spread).',
      ],
      badgeColor: 'text-accent-red bg-accent-red/10 border-accent-red/20',
    },
  }[classification];

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 font-mono space-y-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border-primary/60">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-bg-tertiary border border-border-secondary">
            <Sliders size={14} className="text-accent-blue" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
              Quantitative Regime &amp; Playbook
            </h3>
            <p className="text-[10px] text-text-tertiary">
              Pivot Anchor: ₹{fmt(pivot)} &bull; Bias: {trend} &bull; Volatility assessment &bull; Strategic execution rules
            </p>
          </div>
        </div>

        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${playbook.badgeColor}`}>
          {classification} &bull; {trend}
        </span>
      </div>

      {/* Volatility Meter */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[10px] text-text-secondary">
          <span className="flex items-center gap-1">
            <Zap size={11} className="text-accent-amber" />
            CPR Width Relative Expansion (Max: 1.50%)
          </span>
          <span className="font-bold text-text-primary">{formatPct(width)}</span>
        </div>
        <div className="w-full bg-bg-primary h-2 rounded border border-border-primary overflow-hidden p-[1px]">
          <div
            className={`h-full rounded-sm transition-all duration-500 ${
              classification === 'NARROW'
                ? 'bg-accent-green'
                : classification === 'WIDE'
                ? 'bg-accent-red'
                : 'bg-accent-amber'
            }`}
            style={{ width: `${widthFillPct}%` }}
          />
        </div>
      </div>

      {/* Directional Positioning (if close is provided) */}
      {positioning && (
        <div className={`p-2.5 rounded border ${positioning.bg} space-y-1`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold flex items-center gap-1.5 ${positioning.color}`}>
              {positioning.icon}
              {positioning.label}
            </span>
            <span className="text-[9px] text-text-tertiary uppercase">Close vs CPR</span>
          </div>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            {positioning.desc}
          </p>
        </div>
      )}

      {/* MTF Confluence Zones (if available) */}
      {confluence && (confluence.strongSupport.length > 0 || confluence.strongResistance.length > 0) && (
        <div className="bg-bg-tertiary/60 border border-accent-amber/30 rounded p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent-amber uppercase tracking-wider">
            <Sparkles size={13} />
            Multi-Timeframe Confluence Overlaps (D + W + M)
          </div>

          <div className="space-y-1 text-xs">
            {confluence.strongSupport.length > 0 && (
              <div className="flex items-center gap-2 text-accent-green bg-accent-green/5 border border-accent-green/15 px-2 py-1 rounded">
                <span className="text-[10px] font-bold uppercase">Strong Support:</span>
                <span className="font-bold">₹{confluence.strongSupport.map((p) => fmt(p)).join(', ')}</span>
                <span className="text-[9px] text-text-tertiary">(Weekly + Monthly S1 alignment)</span>
              </div>
            )}

            {confluence.strongResistance.length > 0 && (
              <div className="flex items-center gap-2 text-accent-red bg-accent-red/5 border border-accent-red/15 px-2 py-1 rounded">
                <span className="text-[10px] font-bold uppercase">Strong Resistance:</span>
                <span className="font-bold">₹{confluence.strongResistance.map((p) => fmt(p)).join(', ')}</span>
                <span className="text-[9px] text-text-tertiary">(Weekly + Monthly R1 alignment)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Strategic Playbook Bullet Points */}
      <div className="space-y-2 pt-1 border-t border-border-primary/50">
        <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-1.5">
          <ShieldAlert size={12} className="text-accent-blue" />
          {playbook.headline}
        </div>

        <ul className="space-y-1.5 text-[11px] text-text-secondary">
          {playbook.tactics.map((tactic, i) => (
            <li key={i} className="flex items-start gap-2 bg-bg-tertiary/30 p-1.5 rounded border border-border-primary/30">
              <span className="text-accent-blue font-bold mt-0.5">&bull;</span>
              <span className="leading-snug">{tactic}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CPR Axiom Footer */}
      <div className="text-[10px] text-text-tertiary bg-bg-tertiary/20 p-2 rounded flex items-center gap-1.5 border border-border-primary/30">
        <Info size={12} className="text-text-secondary shrink-0" />
        <span>
          <strong>The 80% Rule:</strong> If price opens outside CPR and breaks past BC/TC during the first hour, there is an ~80% statistical probability of testing the opposite band.
        </span>
      </div>
    </div>
  );
};

export default CPRInterpretation;
