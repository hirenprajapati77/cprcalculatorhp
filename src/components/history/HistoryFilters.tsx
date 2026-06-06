'use client';

import React from 'react';
import { CalendarRange, Search, Filter } from 'lucide-react';

export interface FilterState {
  classification: 'ALL' | 'NARROW' | 'NORMAL' | 'WIDE';
  timeframe: 'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  searchQuery: string;
}

interface HistoryFiltersProps {
  filters: FilterState;
  onFiltersChange: (newFilters: FilterState) => void;
}

export const HistoryFilters: React.FC<HistoryFiltersProps> = ({
  filters,
  onFiltersChange,
}) => {
  const handleClassificationClick = (cls: FilterState['classification']) => {
    onFiltersChange({ ...filters, classification: cls });
  };

  const handleTimeframeClick = (tf: FilterState['timeframe']) => {
    onFiltersChange({ ...filters, timeframe: tf });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, searchQuery: e.target.value });
  };

  return (
    <div className="bg-bg-primary border border-border-primary rounded-lg p-4 space-y-3 font-mono text-xs">
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-tertiary">
            <Search size={14} />
          </span>
          <input
            type="text"
            value={filters.searchQuery}
            onChange={handleSearchChange}
            placeholder="Search by High, Low, Close or Pivot values..."
            className="w-full bg-bg-secondary border border-border-secondary rounded pl-9 pr-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/30 transition-all"
          />
        </div>

        {/* Timeframe Filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-text-tertiary flex items-center gap-1">
            <CalendarRange size={13} />
            Period:
          </span>
          <div className="flex bg-bg-secondary rounded border border-border-secondary p-0.5">
            {(['ALL', 'DAILY', 'WEEKLY', 'MONTHLY'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => handleTimeframeClick(tf)}
                className={`px-2.5 py-1 text-[10px] rounded-sm font-semibold tracking-wide uppercase transition-colors ${
                  filters.timeframe === tf
                    ? 'bg-border-tertiary text-text-primary'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Classification Filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-text-tertiary flex items-center gap-1">
            <Filter size={13} />
            Type:
          </span>
          <div className="flex bg-bg-secondary rounded border border-border-secondary p-0.5">
            {(['ALL', 'NARROW', 'NORMAL', 'WIDE'] as const).map((cls) => (
              <button
                key={cls}
                type="button"
                onClick={() => handleClassificationClick(cls)}
                className={`px-2.5 py-1 text-[10px] rounded-sm font-semibold tracking-wide uppercase transition-colors ${
                  filters.classification === cls
                    ? 'bg-border-tertiary text-text-primary'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {cls}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoryFilters;
