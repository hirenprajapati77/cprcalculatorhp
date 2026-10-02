'use client';

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { fmt, formatPct } from '@/utils/format';
import { CPRResult, CPRClassification, CPRTrend } from '@/types/cpr.types';
import { Compass, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';

export interface CPRTimeframeCardProps {
  timeframe: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  title: string;
  data: (CPRResult & { width?: number | undefined; classification?: CPRClassification | undefined; trend?: CPRTrend | undefined }) | null;
  high?: number | undefined;
  low?: number | undefined;
  close?: number | undefined;
  isLoading?: boolean | undefined;
  emptyPrompt?: string | undefined;
  onActionClick?: (() => void) | undefined;
  actionLabel?: string | undefined;
}

export const CPRTimeframeCard: React.FC<CPRTimeframeCardProps> = ({
  timeframe,
  title,
  data,
  high,
  low,
  close,
  isLoading = false,
  emptyPrompt,
  onActionClick,
  actionLabel,
}) => {
  const getClassificationVariant = (cls?: string) => {
    if (cls === 'NARROW') return 'green';
    if (cls === 'WIDE') return 'red';
    return 'amber';
  };

  const getTrendIcon = (trend?: string) => {
    if (trend === 'Trending') return <TrendingUp size={12} className="text-accent-green" />;
    if (trend === 'Ranging') return <TrendingDown size={12} className="text-accent-red" />;
    return <Minus size={12} className="text-accent-amber" />;
  };

  const range = high !== undefined && low !== undefined ? Math.abs(high - low) : undefined;
  const spread = data ? Math.abs(data.tc - data.bc) : undefined;

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 font-mono flex flex-col justify-between hover:border-border-secondary transition-colors relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border-primary/60 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-bg-tertiary border border-border-secondary">
            <Compass size={14} className="text-accent-blue" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              {title}
              <span className="text-[9px] font-normal text-text-tertiary uppercase">({timeframe})</span>
            </div>
            {data?.trend && (
              <div className="text-[10px] text-text-secondary flex items-center gap-1">
                {getTrendIcon(data.trend)}
                <span>{data.trend} Bias</span>
              </div>
            )}
          </div>
        </div>

        {data?.classification ? (
          <Badge variant={getClassificationVariant(data.classification)}>
            {data.classification}
          </Badge>
        ) : (
          <span className="text-[9px] text-text-tertiary uppercase">Pending</span>
        )}
      </div>

      {/* Body / Content */}
      {isLoading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-text-tertiary">
          <Loader2 size={20} className="animate-spin text-accent-blue" />
          <span className="text-[11px]">Computing {timeframe.toLowerCase()} levels...</span>
        </div>
      ) : !data ? (
        <div className="py-6 flex flex-col items-center justify-center text-center px-2">
          <p className="text-[11px] text-text-tertiary leading-relaxed mb-3">
            {emptyPrompt || `Calculate or select a symbol to unlock ${timeframe.toLowerCase()} CPR.`}
          </p>
          {onActionClick && actionLabel && (
            <button
              type="button"
              onClick={onActionClick}
              className="text-[10px] text-accent-blue hover:underline font-semibold uppercase tracking-wider bg-accent-blue/10 border border-accent-blue/20 px-2 py-1 rounded"
            >
              {actionLabel}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Triple Pivot Band */}
          <div className="bg-bg-tertiary/60 border border-border-secondary/80 rounded-md p-3 space-y-2">
            {/* TC */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-[10px] font-semibold text-accent-green uppercase tracking-wide">
                TC (Top Central)
              </span>
              <span className="font-bold text-text-primary">{fmt(data.tc)}</span>
            </div>

            {/* Pivot */}
            <div className="flex items-center justify-between py-1.5 px-2 rounded bg-accent-blue/10 border border-accent-blue/20 text-sm">
              <span className="text-[11px] font-bold text-accent-blue uppercase tracking-wider">
                Pivot Point (P)
              </span>
              <span className="font-extrabold text-accent-blue tracking-tight">{fmt(data.pivot)}</span>
            </div>

            {/* BC */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-[10px] font-semibold text-accent-green/80 uppercase tracking-wide">
                BC (Bottom Central)
              </span>
              <span className="font-bold text-text-primary/90">{fmt(data.bc)}</span>
            </div>
          </div>

          {/* Width and Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-[10px] text-center">
            <div className="bg-bg-tertiary/40 border border-border-primary/50 rounded p-1.5">
              <div className="text-text-tertiary uppercase text-[9px] mb-0.5">CPR Width</div>
              <div className="font-bold text-text-primary">
                {data.width !== undefined ? formatPct(data.width) : 'N/A'}
              </div>
            </div>

            <div className="bg-bg-tertiary/40 border border-border-primary/50 rounded p-1.5">
              <div className="text-text-tertiary uppercase text-[9px] mb-0.5">Band Spread</div>
              <div className="font-bold text-text-primary">
                {spread !== undefined ? `₹${fmt(spread)}` : 'N/A'}
              </div>
            </div>
          </div>

          {/* OHLC Reference */}
          {(high !== undefined || low !== undefined || close !== undefined) && (
            <div className="pt-2 border-t border-border-primary/50 flex items-center justify-between text-[10px] text-text-tertiary">
              <span>H: <strong className="text-text-secondary">{high !== undefined ? fmt(high) : '-'}</strong></span>
              <span>L: <strong className="text-text-secondary">{low !== undefined ? fmt(low) : '-'}</strong></span>
              <span>C: <strong className="text-text-secondary">{close !== undefined ? fmt(close) : '-'}</strong></span>
              {range !== undefined && (
                <span>Range: <strong className="text-text-secondary">₹{fmt(range)}</strong></span>
              )}
            </div>
          )}

          {/* Outer Boundary Preview (R1/S1) */}
          <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
            <div className="flex justify-between items-center px-2 py-1 rounded bg-accent-red/5 border border-accent-red/15">
              <span className="text-accent-red font-semibold">R1</span>
              <span className="font-bold text-accent-red">{fmt(data.r1)}</span>
            </div>
            <div className="flex justify-between items-center px-2 py-1 rounded bg-accent-blue/5 border border-accent-blue/15">
              <span className="text-accent-blue font-semibold">S1</span>
              <span className="font-bold text-accent-blue">{fmt(data.s1)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CPRTimeframeCard;
