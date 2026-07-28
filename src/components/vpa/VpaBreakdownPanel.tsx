'use client';

import React from 'react';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { VpaConfirmationResult } from '@/services/vpa/vpa.types';

export type VpaBreakdownView = Pick<
  VpaConfirmationResult,
  | 'enabled'
  | 'direction'
  | 'confirmed'
  | 'adjustment'
  | 'maxAdjustment'
  | 'breakdown'
  | 'flags'
  | 'metrics'
  | 'rejectRecommended'
  | 'rejectReason'
  | 'live'
>;

function fmtAdj(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return '0';
}

function adjColor(n: number): string {
  if (n > 0) return 'text-accent-green';
  if (n < 0) return 'text-accent-red';
  return 'text-text-secondary';
}

const COMPONENT_LABELS: { key: keyof VpaBreakdownView['breakdown']; label: string }[] = [
  { key: 'rvol', label: 'RVOL' },
  { key: 'clv', label: 'CLV' },
  { key: 'effortResult', label: 'Effort vs Result' },
  { key: 'breakoutConfirm', label: 'Breakout Confirm' },
  { key: 'buyingClimax', label: 'Buying Climax' },
  { key: 'sellingClimax', label: 'Selling Climax' },
  { key: 'noDemand', label: 'No Demand' },
  { key: 'noSupply', label: 'No Supply' },
];

export function VpaStatusChip({ vpa }: { vpa: VpaBreakdownView | null | undefined }) {
  if (!vpa?.enabled) return null;

  const liveBadge = vpa.live ? (
    <span className="ml-0.5 text-[8px] font-extrabold tracking-wider text-rose-300">LIVE</span>
  ) : null;

  if (vpa.rejectRecommended) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-accent-red/15 text-accent-red border ${
          vpa.live ? 'border-rose-400/60 ring-1 ring-rose-400/30' : 'border-accent-red/30'
        }`}
      >
        VPA ✗{liveBadge}
      </span>
    );
  }
  if (vpa.confirmed && vpa.adjustment >= 0) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-accent-green/15 text-accent-green border ${
          vpa.live ? 'border-rose-400/60 ring-1 ring-rose-400/30' : 'border-accent-green/30'
        }`}
      >
        VPA ✓{liveBadge}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-accent-amber/10 text-accent-amber border ${
        vpa.live ? 'border-rose-400/60 ring-1 ring-rose-400/30' : 'border-accent-amber/25'
      }`}
    >
      VPA ~{liveBadge}
    </span>
  );
}

interface VpaBreakdownPanelProps {
  vpa: VpaBreakdownView | null | undefined;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}

export function VpaBreakdownPanel({
  vpa,
  loading = false,
  compact = false,
  className = '',
}: VpaBreakdownPanelProps) {
  if (loading) {
    return (
      <div className={`border border-border-primary rounded p-3 text-[10px] text-text-tertiary animate-pulse ${className}`}>
        Loading volume confirmation…
      </div>
    );
  }

  if (!vpa?.enabled) {
    return (
      <div className={`border border-border-primary/60 rounded p-3 text-[10px] text-text-tertiary italic ${className}`}>
        VPA confirmation unavailable for this symbol.
      </div>
    );
  }

  const { metrics, breakdown, flags, adjustment, maxAdjustment } = vpa;

  return (
    <div
      className={`rounded p-3 space-y-2.5 ${
        vpa.live
          ? 'border border-rose-400/40 bg-rose-950/15'
          : 'border border-cyan-500/25 bg-cyan-950/10'
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`font-bold flex items-center gap-1 uppercase text-[10px] tracking-wide ${
            vpa.live ? 'text-rose-300' : 'text-cyan-300'
          }`}
        >
          <Activity size={12} />
          VPA Confirmation
          <span className="text-text-tertiary font-normal normal-case">
            {vpa.live ? '(live)' : '(shadow)'}
          </span>
        </span>
        <div className="text-right">
          <span className={`text-sm font-bold font-mono ${adjColor(adjustment)}`}>
            {fmtAdj(adjustment)}
          </span>
          <span className="block text-[9px] text-text-tertiary">/ ±{maxAdjustment} max</span>
        </div>
      </div>

      <p className="text-[9px] text-text-tertiary leading-relaxed">
        {vpa.live
          ? 'Volume confirmation is live — this adjustment is currently factored into confidence and/or entry gates.'
          : 'Volume confirms price action only — does not change the Advanced score in shadow mode.'}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {vpa.confirmed && !vpa.rejectRecommended ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-accent-green">
            <CheckCircle2 size={11} /> Confirmed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-accent-amber">
            <AlertTriangle size={11} /> Weak / caution
          </span>
        )}
        <span className="text-[9px] text-text-tertiary">
          {vpa.direction} bias
        </span>
      </div>

      {vpa.rejectRecommended && vpa.rejectReason && (
        <div className="p-2 rounded border border-accent-red/30 bg-accent-red/10 text-[9px] text-accent-red/90">
          <span className="font-bold uppercase tracking-wide block mb-0.5">Gate recommendation</span>
          {vpa.rejectReason}
        </div>
      )}

      {!compact && (
        <>
          <div className="grid grid-cols-3 gap-2 text-[9px] border-t border-border-primary/40 pt-2">
            <div>
              <span className="text-text-tertiary block">RVOL</span>
              <span className="font-mono font-bold text-text-primary">
                {metrics.rvol != null ? `${metrics.rvol.toFixed(2)}×` : '—'}
              </span>
            </div>
            <div>
              <span className="text-text-tertiary block">CLV</span>
              <span className="font-mono font-bold text-text-primary">
                {metrics.clv != null ? metrics.clv.toFixed(2) : '—'}
              </span>
            </div>
            <div>
              <span className="text-text-tertiary block">Range</span>
              <span className="font-mono font-bold text-text-primary">
                {metrics.rangePct != null ? `${(metrics.rangePct * 100).toFixed(2)}%` : '—'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] border-t border-border-primary/40 pt-2">
            {COMPONENT_LABELS.map(({ key, label }) => {
              const val = breakdown[key];
              if (val === 0) return null;
              return (
                <div key={key} className="flex justify-between border-b border-border-primary/20 pb-0.5">
                  <span className="text-text-tertiary truncate pr-1">{label}</span>
                  <span className={`font-mono font-bold shrink-0 ${adjColor(val)}`}>{fmtAdj(val)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-border-primary/40">
          {flags.map((flag) => (
            <span
              key={flag}
              className="px-1.5 py-0.5 rounded text-[8px] font-mono bg-bg-primary/60 text-cyan-200/90 border border-cyan-500/20"
            >
              {flag.replace('VPA_', '')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
