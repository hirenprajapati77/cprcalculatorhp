'use client';

import React from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Clock,
  ExternalLink,
  Info,
  Sparkles,
} from 'lucide-react';
import { fmt, formatPct } from '@/utils/format';
import { Button } from '@/components/ui/Button';

export interface JournalTradeData {
  id: string;
  tradeDate: string;
  signalType: 'CPR' | 'BTST' | 'STBT';
  symbol: string;
  optionContract: string;
  optionStrike: number;
  optionType: 'CE' | 'PE';
  entryCmp: number;
  entryTime: string;
  cmp916: number | null;
  cmp930: number | null;
  cmp945: number | null;
  cmp1000: number | null;
  exitCmp: number | null;
  exitTime: string | null;
  pnl: number | null;
  pnlPct: number | null;
  score: number;
  scoreV2?: number | null | undefined;
  confidence: number;
  signalSummary: string;
  executionOutcome?: string | null | undefined;
  qualityBucketAtSignal?: string | null | undefined;
  eventRiskReasonAtSignal?: string | null | undefined;
  regimeSnapshotAtSignal?: string | null | undefined;
  estimatedCharges?: number | null | undefined;
  estimatedNetPnl?: number | null | undefined;
  estimatedNetPnlPct?: number | null | undefined;
  frictionModelTier?: string | null | undefined;
}

export interface TradeDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  trade: JournalTradeData | null;
  onInspectStock?: ((symbol: string) => void) | undefined;
}

export const TradeDetailDrawer: React.FC<TradeDetailDrawerProps> = ({
  isOpen,
  onClose,
  trade,
  onInspectStock,
}) => {
  if (!isOpen || !trade) return null;

  const isClosed = trade.exitCmp !== null && trade.exitCmp !== undefined;
  const isProfit = (trade.pnl ?? 0) >= 0;
  const isNetProfit = (trade.estimatedNetPnl ?? trade.pnl ?? 0) >= 0;

  // Timeline snapshot check points
  const timelinePoints = [
    { label: 'Trade Entry', time: trade.entryTime || '15:15 IST', price: trade.entryCmp, note: 'Initial execution' },
    { label: '09:16 Market Open', time: '09:16 IST', price: trade.cmp916, note: 'Cash open snapshot' },
    { label: '09:30 Session Check', time: '09:30 IST', price: trade.cmp930, note: 'Morning extension check' },
    { label: '09:45 Session Check', time: '09:45 IST', price: trade.cmp945, note: 'Mid-morning liquidity check' },
    { label: '10:00 Morning Window', time: '10:00 IST', price: trade.cmp1000, note: 'Mandatory BTST exit window' },
    { label: 'Trade Exit', time: trade.exitTime || 'Settlement', price: trade.exitCmp, note: isClosed ? 'Final settlement' : 'Awaiting manual/auto exit' },
  ];

  const signals = trade.signalSummary ? trade.signalSummary.split(',').filter(Boolean) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs font-mono animate-fade-in select-none">
      <div className="w-full max-w-xl bg-bg-secondary border-l border-border-primary h-full overflow-y-auto flex flex-col shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-bg-secondary/95 backdrop-blur-md border-b border-border-primary p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                trade.signalType === 'BTST'
                  ? 'bg-accent-green/10 text-accent-green border border-accent-green/20'
                  : trade.signalType === 'STBT'
                  ? 'bg-accent-red/10 text-accent-red border border-accent-red/20'
                  : 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
              }`}
            >
              {trade.signalType}
            </span>

            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-text-primary uppercase tracking-tight">
                  {trade.symbol}
                </h2>
                <span className="text-xs text-text-secondary font-semibold">
                  {trade.optionStrike} {trade.optionType}
                </span>
              </div>
              <span className="text-[10px] text-text-tertiary">
                Trade Date: {trade.tradeDate} &bull; Contract: {trade.optionContract}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onInspectStock && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onInspectStock(trade.symbol)}
                className="text-xs flex items-center gap-1 text-accent-blue"
                title="Inspect underlying stock in Quantitative Stock Drawer"
              >
                <ExternalLink size={12} />
                Stock
              </Button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-5 flex-1">
          {/* 1. Settlement & P&L Quad */}
          <div className="grid grid-cols-2 gap-3">
            {/* Authoritative Gross P&L */}
            <div className="bg-bg-tertiary/50 border border-border-primary p-3 rounded-lg space-y-1">
              <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase tracking-wider">
                <span>Authoritative Gross</span>
                {isClosed && (
                  <span className={`flex items-center gap-1 font-bold ${isProfit ? 'text-accent-green' : 'text-accent-red'}`}>
                    {isProfit ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {isProfit ? '+' : ''}{formatPct(trade.pnlPct ?? 0)}
                  </span>
                )}
              </div>
              <div className={`text-xl font-bold tracking-tight ${isProfit ? 'text-accent-green' : 'text-accent-red'}`}>
                {isClosed ? `${(trade.pnl ?? 0) >= 0 ? '+' : ''}₹${fmt(trade.pnl ?? 0)}` : 'In Progress'}
              </div>
              <div className="text-[9px] text-text-tertiary">
                Entry: ₹{fmt(trade.entryCmp)} &rarr; Exit: {trade.exitCmp ? `₹${fmt(trade.exitCmp)}` : 'Open'}
              </div>
            </div>

            {/* Modeled Estimated Net P&L */}
            <div className="bg-bg-tertiary/50 border border-border-primary p-3 rounded-lg space-y-1">
              <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase tracking-wider">
                <span>Estimated Net P&amp;L</span>
                {trade.estimatedNetPnlPct !== null && trade.estimatedNetPnlPct !== undefined && (
                  <span className={`flex items-center gap-1 font-bold ${isNetProfit ? 'text-accent-green' : 'text-accent-red'}`}>
                    {isNetProfit ? '+' : ''}{formatPct(trade.estimatedNetPnlPct)}
                  </span>
                )}
              </div>
              <div className={`text-xl font-bold tracking-tight ${isNetProfit ? 'text-accent-green' : 'text-accent-red'}`}>
                {trade.estimatedNetPnl !== null && trade.estimatedNetPnl !== undefined
                  ? `${trade.estimatedNetPnl >= 0 ? '+' : ''}₹${fmt(trade.estimatedNetPnl)}`
                  : isClosed
                  ? `${(trade.pnl ?? 0) >= 0 ? '+' : ''}₹${fmt((trade.pnl ?? 0) - (trade.estimatedCharges ?? 0))}`
                  : 'Pending'}
              </div>
              <div className="text-[9px] text-accent-amber">
                Friction: -₹{fmt(trade.estimatedCharges ?? 0)} ({trade.frictionModelTier || 'FUTURES_PROXY'})
              </div>
            </div>
          </div>

          {/* 2. Quantitative Model Signals & Quality */}
          <div className="bg-bg-tertiary/30 border border-border-primary rounded-lg p-3 space-y-2.5">
            <div className="flex items-center justify-between border-b border-border-primary/50 pb-2">
              <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={12} className="text-accent-amber" />
                Signal Score &amp; Quality Context
              </span>
              <div className="flex items-center gap-2">
                {trade.qualityBucketAtSignal && (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-bg-tertiary text-text-secondary border border-border-secondary">
                    {trade.qualityBucketAtSignal}
                  </span>
                )}
                {trade.executionOutcome && (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                    {trade.executionOutcome}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-bg-secondary p-2 rounded border border-border-primary">
                <div className="text-[9px] text-text-tertiary uppercase">Model Score</div>
                <div className="font-bold text-text-primary mt-0.5">{trade.score} / 100</div>
              </div>
              <div className="bg-bg-secondary p-2 rounded border border-border-primary">
                <div className="text-[9px] text-text-tertiary uppercase">Confidence</div>
                <div className="font-bold text-accent-blue mt-0.5">{trade.confidence}%</div>
              </div>
              <div className="bg-bg-secondary p-2 rounded border border-border-primary">
                <div className="text-[9px] text-text-tertiary uppercase">Regime</div>
                <div className="font-bold text-text-secondary mt-0.5">{trade.regimeSnapshotAtSignal || 'NORMAL'}</div>
              </div>
            </div>

            {signals.length > 0 && (
              <div className="pt-1">
                <div className="text-[9px] text-text-tertiary uppercase mb-1">Trigger Signals</div>
                <div className="flex flex-wrap gap-1">
                  {signals.map((sig, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-mono bg-bg-secondary border border-border-primary px-1.5 py-0.5 rounded text-text-secondary"
                    >
                      {sig}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. Trade Lifecycle Execution Timeline */}
          <div className="bg-bg-tertiary/30 border border-border-primary rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between border-b border-border-primary/50 pb-2">
              <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={12} className="text-accent-blue" />
                Execution Lifecycle Timeline
              </span>
              <span className="text-[9px] text-text-tertiary">
                IST Time Markers
              </span>
            </div>

            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-border-primary">
              {timelinePoints.map((pt, idx) => {
                const hasValue = pt.price !== null && pt.price !== undefined;
                return (
                  <div key={idx} className="relative group">
                    <span
                      className={`absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-bg-secondary ${
                        hasValue ? 'bg-accent-blue ring-2 ring-accent-blue/20' : 'bg-bg-tertiary border-border-secondary'
                      }`}
                    />
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-text-primary flex items-center gap-1.5">
                          {pt.label}
                          <span className="text-[10px] text-text-tertiary font-normal">({pt.time})</span>
                        </div>
                        <div className="text-[10px] text-text-tertiary">{pt.note}</div>
                      </div>

                      <div className="text-right">
                        {hasValue ? (
                          <div className="font-bold text-text-primary">
                            ₹{fmt(pt.price!)}
                          </div>
                        ) : (
                          <span className="text-[10px] text-text-tertiary italic">Pending</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Friction Breakdown Clarification */}
          <div className="bg-bg-tertiary/20 border border-border-primary rounded p-3 text-[10px] text-text-tertiary space-y-1">
            <div className="flex items-center gap-1 font-semibold text-text-secondary">
              <Info size={11} className="text-accent-blue" />
              Statutory Friction Specification (PR #254)
            </div>
            <p className="leading-relaxed">
              Authoritative Gross P&amp;L reflects pure trade execution price differential without assumptions. Estimated Charges reflects modeling of statutory STT (0.0125% sell-side on options / futures statutory turnover), exchange transaction charges, GST (18%), and SEBI fees under tier <strong>{trade.frictionModelTier || 'FUTURES_PROXY'}</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeDetailDrawer;
