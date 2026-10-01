'use client';

import React from 'react';
import {
  Search,
  RotateCcw,
  SlidersHorizontal,
  Calendar,
  Columns,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface JournalFiltersState {
  search: string;
  signalType: 'ALL' | 'CPR' | 'BTST' | 'STBT';
  qualityBucket: 'ALL' | 'TRADEABLE' | 'WATCHLIST' | 'LOW_QUALITY';
  executionOutcome: string;
  pnlStatus: 'ALL' | 'WINNERS' | 'LOSERS';
  direction: 'ALL' | 'LONG' | 'SHORT';
  tradeStatus: 'ALL' | 'OPEN' | 'CLOSED';
  fromDate: string;
  toDate: string;
}

export interface JournalFiltersProps {
  filters: JournalFiltersState;
  onChange: (filters: JournalFiltersState) => void;
  onReset: () => void;
  densityMode: 'compact' | 'detailed';
  onToggleDensity: () => void;
  onOpenColumnSettings?: (() => void) | undefined;
}

export const JournalFilters: React.FC<JournalFiltersProps> = ({
  filters,
  onChange,
  onReset,
  densityMode,
  onToggleDensity,
  onOpenColumnSettings,
}) => {
  const signalTypes: Array<'ALL' | 'CPR' | 'BTST' | 'STBT'> = ['ALL', 'CPR', 'BTST', 'STBT'];
  const directions: Array<'ALL' | 'LONG' | 'SHORT'> = ['ALL', 'LONG', 'SHORT'];
  const tradeStatuses: Array<'ALL' | 'OPEN' | 'CLOSED'> = ['ALL', 'OPEN', 'CLOSED'];
  const qualityBuckets: Array<'ALL' | 'TRADEABLE' | 'WATCHLIST' | 'LOW_QUALITY'> = [
    'ALL',
    'TRADEABLE',
    'WATCHLIST',
    'LOW_QUALITY',
  ];
  const pnlStatuses: Array<'ALL' | 'WINNERS' | 'LOSERS'> = ['ALL', 'WINNERS', 'LOSERS'];

  const handleUpdate = (patch: Partial<JournalFiltersState>) => {
    onChange({ ...filters, ...patch });
  };

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 font-mono space-y-3 select-none">
      {/* Top row: Search, Date Pickers, Density & Column settings */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search symbol or strike..."
            value={filters.search}
            onChange={(e) => handleUpdate({ search: e.target.value.toUpperCase() })}
            className="w-full bg-bg-tertiary border border-border-secondary rounded pl-8 pr-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-blue"
          />
        </div>

        {/* Date Inputs */}
        <div className="flex items-center gap-1.5 text-xs">
          <Calendar size={13} className="text-text-tertiary" />
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => handleUpdate({ fromDate: e.target.value })}
            className="bg-bg-tertiary border border-border-secondary rounded px-2 py-1 text-[11px] text-text-primary focus:outline-none focus:border-accent-blue"
            title="From Date"
          />
          <span className="text-text-tertiary text-xs">&ndash;</span>
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => handleUpdate({ toDate: e.target.value })}
            className="bg-bg-tertiary border border-border-secondary rounded px-2 py-1 text-[11px] text-text-primary focus:outline-none focus:border-accent-blue"
            title="To Date"
          />
        </div>

        {/* Action Controls: Density, Columns, Reset */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Density toggle */}
          <Button
            variant="secondary"
            size="sm"
            onClick={onToggleDensity}
            className="text-[11px] h-8 flex items-center gap-1"
            title={`Toggle table row density (Current: ${densityMode})`}
          >
            <SlidersHorizontal size={12} />
            <span className="capitalize">{densityMode}</span>
          </Button>

          {/* Column visibility toggle */}
          {onOpenColumnSettings && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenColumnSettings}
              className="text-[11px] h-8 flex items-center gap-1"
              title="Configure visible columns"
            >
              <Columns size={12} />
              Columns
            </Button>
          )}

          {/* Reset button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-[11px] h-8 text-text-tertiary hover:text-accent-red flex items-center gap-1"
            title="Reset all filters"
          >
            <RotateCcw size={12} />
            Reset
          </Button>
        </div>
      </div>

      {/* Filter Chips Row */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border-primary/50 text-[11px]">
        {/* Signal Type filter */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-tertiary uppercase font-semibold mr-0.5">Type:</span>
          {signalTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleUpdate({ signalType: type })}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                filters.signalType === type
                  ? 'bg-accent-blue text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border-primary'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="hidden sm:block h-3 w-[1px] bg-border-primary" />

        {/* Outcome (Winners / Losers) */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-tertiary uppercase font-semibold mr-0.5">P&amp;L:</span>
          {pnlStatuses.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => handleUpdate({ pnlStatus: st })}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                filters.pnlStatus === st
                  ? st === 'WINNERS'
                    ? 'bg-accent-green text-black font-bold'
                    : st === 'LOSERS'
                    ? 'bg-accent-red text-white font-bold'
                    : 'bg-accent-blue text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border-primary'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="hidden sm:block h-3 w-[1px] bg-border-primary" />

        {/* Quality Bucket filter */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-tertiary uppercase font-semibold mr-0.5">Quality:</span>
          {qualityBuckets.map((bucket) => (
            <button
              key={bucket}
              type="button"
              onClick={() => handleUpdate({ qualityBucket: bucket })}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                filters.qualityBucket === bucket
                  ? 'bg-accent-blue text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border-primary'
              }`}
            >
              {bucket}
            </button>
          ))}
        </div>

        <div className="hidden sm:block h-3 w-[1px] bg-border-primary" />

        {/* Direction filter */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-tertiary uppercase font-semibold mr-0.5">Dir:</span>
          {directions.map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => handleUpdate({ direction: dir })}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                filters.direction === dir
                  ? dir === 'LONG'
                    ? 'bg-accent-green text-black font-bold'
                    : dir === 'SHORT'
                    ? 'bg-accent-red text-white font-bold'
                    : 'bg-accent-blue text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border-primary'
              }`}
            >
              {dir}
            </button>
          ))}
        </div>

        <div className="hidden sm:block h-3 w-[1px] bg-border-primary" />

        {/* Position Status filter (Open / Closed) */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-tertiary uppercase font-semibold mr-0.5">Status:</span>
          {tradeStatuses.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => handleUpdate({ tradeStatus: st })}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                filters.tradeStatus === st
                  ? st === 'OPEN'
                    ? 'bg-accent-amber text-black font-bold'
                    : 'bg-accent-blue text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border-primary'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default JournalFilters;
