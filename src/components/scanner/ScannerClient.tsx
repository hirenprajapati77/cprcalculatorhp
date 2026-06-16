'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Radar, 
  RefreshCw, 
  Search, 
  Star, 
  ChevronLeft, 
  ChevronRight, 
  ArrowUpDown, 
  TrendingUp, 
  AlertTriangle,
  Layers,
  Activity,
  Award,
  Pin,
  Bell,
  X,
  Target,
  Sparkles,
  Clock,
  LayoutGrid
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { LevelChart } from '@/components/chart/LevelChart';
import { fmt } from '@/utils/format';

function useBtstState() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 100 + minutes;

  let state = 'PREMARKET';
  let message = 'Signals unlock at 15:20 IST';
  let emptyMessage = 'BTST discovery has not started.';
  let nextRefresh = '';
  
  if (time < 1515) {
    state = 'PREMARKET';
    message = 'Signals unlock at 15:20 IST';
    emptyMessage = 'BTST discovery has not started.';
    const target = new Date(now); target.setHours(15, 15, 0, 0);
    const diff = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
    nextRefresh = `${Math.floor(diff / 60)}m ${diff % 60}s`;
  } else if (time >= 1515 && time < 1520) {
    state = 'DISCOVERING';
    message = 'Collecting final market structure';
    emptyMessage = 'BTST discovery has not started.';
    const target = new Date(now); target.setHours(15, 20, 0, 0);
    const diff = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
    nextRefresh = `${Math.floor(diff / 60)}m ${diff % 60}s`;
  } else if (time >= 1520 && time < 1525) {
    state = 'ACTIVE';
    message = 'Generating BTST candidates';
    emptyMessage = 'Scanning live candidates…';
    const target = new Date(now); target.setHours(15, 25, 0, 0);
    const diff = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
    nextRefresh = `${Math.floor(diff / 60)}m ${diff % 60}s`;
  } else if (time >= 1525 && time < 1530) {
    state = 'FROZEN';
    message = 'Signal generation locked';
    emptyMessage = 'No qualified BTST setups today.';
    nextRefresh = 'Locked';
  } else {
    state = 'MARKET_CLOSED';
    message = 'Market is closed';
    emptyMessage = 'No qualified BTST setups today.';
    nextRefresh = 'Locked';
  }

  return { state, message, emptyMessage, nextRefresh, timeStr: now.toLocaleTimeString('en-IN') };
}

const BtstEmptyState = () => {
  const { emptyMessage, nextRefresh } = useBtstState();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center font-mono select-none animate-fade-in">
      <Radar size={48} className="text-accent-blue/40 mb-3 animate-pulse" />
      <p className="text-xs text-text-primary font-bold">Scanner Empty</p>
      <p className="text-[10px] text-accent-blue mt-1 max-w-[280px]">
        {emptyMessage}
      </p>
      {nextRefresh !== 'Locked' && nextRefresh !== '' && (
        <p className="text-[9px] text-text-secondary mt-2">Next Event: {nextRefresh}</p>
      )}
    </div>
  );
};

const BtstStateBanner = () => {
  const { state, message, nextRefresh, timeStr } = useBtstState();
  
  const getColors = () => {
    switch (state) {
      case 'PREMARKET': return 'bg-bg-secondary text-text-secondary border-border-primary';
      case 'DISCOVERING': return 'bg-accent-amber/10 text-accent-amber border-accent-amber/30';
      case 'ACTIVE': return 'bg-accent-blue/10 text-accent-blue border-accent-blue/30';
      case 'FROZEN': return 'bg-accent-purple/10 text-accent-purple border-accent-purple/30';
      default: return 'bg-bg-tertiary text-text-tertiary border-border-secondary';
    }
  };

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border font-mono text-[11px] mb-4 ${getColors()}`}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {state === 'ACTIVE' && <span className="h-2 w-2 rounded-full bg-accent-blue animate-pulse" />}
          <span className="font-bold tracking-wider">{state}</span>
        </div>
        <span className="hidden sm:inline">{message}</span>
      </div>
      <div className="flex items-center gap-4 text-right">
        <div>
          <span className="block text-[9px] uppercase opacity-70">Current Time</span>
          <span className="font-bold">{timeStr}</span>
        </div>
        <div>
          <span className="block text-[9px] uppercase opacity-70">Next Event</span>
          <span className="font-bold">{nextRefresh}</span>
        </div>
      </div>
    </div>
  );
};

interface ScannedStock {
  id: string;
  symbol: string;
  date: string;
  market: 'NSE' | 'BSE';
  sector: string;
  price: number; // Open price
  open: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  ltp: number;
  score: number;
  confidence: number;
  signalSummary: string;
  pivot: number;
  bc: number;
  tc: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  width: number;
  classification: 'NARROW' | 'NORMAL' | 'WIDE';
  createdAt: string;
  signals: string[];
  volumeRatio: number;
  entry: number;
  sl: number;
  target: number;
  rr: string;
  signalTime?: string;
  expectedGap?: number | null;
  expectedMove?: number | null;
  exitStrategy?: string | null;
  state?: string;
  rejectionReason?: string | null;
  btstClassification?: string;
  scoreBreakdown?: {
    vdu?: number;
    cprNarrow?: number;
    higherValue?: number;
    vwap?: number;
    conf15m?: number;
    closeStrength?: number;
  };
}

interface WatchlistItemState {
  starred: boolean;
  pinned: boolean;
  notify: boolean;
}

interface HistoryLog {
  id: string;
  filters: { universe?: string; market?: string };
  resultCount: number;
  durationMs: number;
  topSymbols: string;
  createdAt: string;
}

const SECTORS_LIST = [
  'IT',
  'Financial Services',
  'Energy',
  'Telecom',
  'Construction',
  'Consumer Goods',
  'Automotive',
  'Power',
  'Healthcare',
  'Materials',
  'Metals',
  'Services',
  'Capital Goods',
];

const SECTOR_ALIASES: Record<string, string[]> = {
  'IT': ['tech', 'technology', 'software', 'computers', 'digital'],
  'Financial Services': ['bank', 'banking', 'finance', 'nbfc', 'loan', 'insurance', 'wealth'],
  'Energy': ['oil', 'gas', 'refinery', 'petro', 'power', 'utility'],
  'Telecom': ['mobile', 'internet', 'communication', 'network'],
  'Construction': ['real estate', 'builder', 'infra', 'infrastructure', 'cement'],
  'Consumer Goods': ['fmcg', 'retail', 'food', 'beverage', 'soap', 'shampoo'],
  'Automotive': ['auto', 'car', 'vehicle', 'bike', 'tyre', 'truck'],
  'Power': ['electricity', 'green energy', 'solar', 'wind', 'hydro'],
  'Healthcare': ['pharma', 'hospital', 'medicine', 'drug', 'clinic'],
};

const getConfidenceStyle = (confidence: number) => {
  if (confidence > 80) return 'text-accent-green';
  if (confidence >= 60) return 'text-accent-amber';
  return 'text-accent-red';
};

const StockRow = React.memo(({
  row,
  densityMode,
  cellPadding,
  visibleColumns,
  isSelected,
  isStarred,
  isPinned,
  isNotified,
  onToggleCompare,
  onToggleWatchlist,
  onOpenDrawer,
  onChartRedirect
}: {
  row: ScannedStock;
  densityMode: 'compact' | 'detailed';
  cellPadding: string;
  visibleColumns: string[];
  isSelected: boolean;
  isStarred: boolean;
  isPinned: boolean;
  isNotified: boolean;
  onToggleCompare: (symbol: string) => void;
  onToggleWatchlist: (symbol: string, key: keyof WatchlistItemState) => void;
  onOpenDrawer: (stock: ScannedStock) => void;
  onChartRedirect: (stock: ScannedStock) => void;
}) => {
  const openPrice = row.price || row.open || row.ltp;
  const priceDiff = row.ltp - openPrice;
  const pctDiff = openPrice > 0 ? (priceDiff / openPrice) * 100 : 0;
  const distTC = ((row.ltp - row.tc) / row.tc) * 100;
  const distBC = ((row.ltp - row.bc) / row.bc) * 100;

  let rowClass = isPinned ? 'bg-accent-blue/5 border-l-2 border-accent-blue' : '';
  if (row.btstClassification) {
    if (row.btstClassification === 'STRONG_BTST') rowClass += ' border-l-2 border-accent-green bg-accent-green/5';
    else if (row.btstClassification === 'BTST_READY') rowClass += ' border-l-2 border-accent-blue bg-accent-blue/5';
    else if (row.btstClassification === 'WATCH') rowClass += ' border-l-2 border-accent-amber bg-accent-amber/5';
    else if (row.btstClassification === 'IGNORE') rowClass += ' border-l-2 border-text-tertiary bg-bg-tertiary/5';
  }

  return (
    <tr 
      className={`hover:bg-bg-tertiary/30 transition-colors group border-b border-border-primary/30 ${rowClass}`}
    >
      {visibleColumns.includes('checkbox') && (
        <td className={`${cellPadding} text-center`}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleCompare(row.symbol)}
            className="cursor-pointer accent-accent-blue rounded h-3.5 w-3.5 border-border-secondary"
          />
        </td>
      )}
      
      {visibleColumns.includes('watchlist') && (
        <td className={`${cellPadding} text-center`}>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onToggleWatchlist(row.symbol, 'starred')}
              className={`hover:scale-110 transition-transform ${isStarred ? 'text-accent-amber' : 'text-text-tertiary group-hover:text-text-secondary'}`}
              title="Star Watchlist"
            >
              <Star size={12} fill={isStarred ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => onToggleWatchlist(row.symbol, 'pinned')}
              className={`hover:scale-110 transition-transform ${isPinned ? 'text-accent-blue' : 'text-text-tertiary group-hover:text-text-secondary'}`}
              title="Pin to Top"
            >
              <Pin size={12} fill={isPinned ? 'currentColor' : 'none'} className={isPinned ? 'rotate-45' : ''} />
            </button>
            <button
              onClick={() => onToggleWatchlist(row.symbol, 'notify')}
              className={`hover:scale-110 transition-transform ${isNotified ? 'text-accent-purple' : 'text-text-tertiary group-hover:text-text-secondary'}`}
              title="Notify Breakouts"
            >
              <Bell size={12} fill={isNotified ? 'currentColor' : 'none'} />
            </button>
          </div>
        </td>
      )}

      {visibleColumns.includes('symbol') && (
        <td className={cellPadding}>
          <div className="flex items-center gap-1">
            <span 
              onClick={() => onOpenDrawer(row)}
              className="font-bold text-text-primary group-hover:text-accent-blue transition-colors cursor-pointer hover:underline"
            >
              {row.symbol}
            </span>
          </div>
          {densityMode === 'detailed' && (
            <span className="block text-[9px] text-text-tertiary mt-0.5">
              {row.sector} | {row.marketCap >= 20000 ? 'Large' : row.marketCap >= 5000 ? 'Mid' : 'Small'}
            </span>
          )}
        </td>
      )}

      {visibleColumns.includes('ltp') && (
        <td className={`${cellPadding} font-semibold`}>
          <span className="text-text-primary">₹{fmt(row.ltp)}</span>
          <span className={`block text-[9px] font-bold ${priceDiff >= 0 ? 'text-accent-green' : 'text-accent-red'} mt-0.5`}>
            {priceDiff >= 0 ? '+' : ''}{pctDiff.toFixed(2)}%
          </span>
        </td>
      )}

      {visibleColumns.includes('distance') && (
        <td className={`${cellPadding} font-medium max-md:hidden`}>
          <span className={distTC >= 0 ? 'text-accent-green' : 'text-text-secondary'}>
            TC: {distTC >= 0 ? '+' : ''}{distTC.toFixed(2)}%
          </span>
          <span className={`block text-[9px] mt-0.5 ${distBC >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
            BC: {distBC >= 0 ? '+' : ''}{distBC.toFixed(2)}%
          </span>
        </td>
      )}

      {visibleColumns.includes('width') && (
        <td className={`${cellPadding} max-md:hidden`}>
          <Badge variant={row.classification === 'NARROW' ? 'amber' : row.classification === 'WIDE' ? 'red' : 'blue'}>
            {row.classification}
          </Badge>
          <span className="block text-[9px] text-text-secondary mt-0.5">
            {row.width.toFixed(3)}%
          </span>
        </td>
      )}

      {visibleColumns.includes('setup') && (
        <td className={cellPadding}>
          {row.entry > 0 ? (
            <div className="flex flex-col gap-1 font-mono text-[10px] leading-tight text-left">
              <div className="flex justify-between gap-3">
                <span className="text-text-tertiary">Entry</span>
                <span className="font-bold text-text-primary">₹{fmt(row.entry)}</span>
              </div>
              {densityMode === 'detailed' ? (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-text-tertiary">SL</span>
                    <span className="font-bold text-accent-red">₹{fmt(row.sl)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-text-tertiary">Target</span>
                    <span className="font-bold text-accent-green">₹{fmt(row.target)}</span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-border-primary/50 pt-0.5 mt-0.5">
                    <span className="text-text-tertiary">RR</span>
                    <span className="font-bold text-accent-blue">{row.rr}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between gap-3 text-[9px] text-text-secondary">
                  <span>T: ₹{fmt(row.target)}</span>
                  <span>RR: {row.rr}</span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-text-tertiary">—</span>
          )}
        </td>
      )}

      {visibleColumns.includes('rr') && (
        <td className={`${cellPadding} font-semibold text-text-primary max-md:hidden`}>
          {row.rr !== '1:1.0' ? row.rr : '—'}
        </td>
      )}

      {visibleColumns.includes('signals') && (
        <td className={cellPadding}>
          <div className="flex flex-wrap gap-1 max-w-[180px]">
            {row.signals.slice(0, densityMode === 'compact' ? 1 : 3).map((sig) => (
              <span
                key={sig}
                className={`text-[8px] font-bold px-1 rounded-sm ${
                  sig === 'BREAKOUT' ? 'bg-accent-green/15 text-accent-green' :
                  sig === 'BULLISH' ? 'bg-accent-blue/15 text-accent-blue' :
                  sig === 'BEARISH' ? 'bg-accent-red/15 text-accent-red' :
                  sig === 'NARROW' ? 'bg-accent-amber/15 text-accent-amber' :
                  'bg-bg-tertiary text-text-secondary border border-border-primary/50'
                }`}
              >
                {sig}
              </span>
            ))}
          </div>
        </td>
      )}

      {visibleColumns.includes('score') && (
        <td className={cellPadding}>
          <div className="space-y-0.5 font-mono text-left">
            <div className="font-bold text-text-primary text-[13px] leading-none">{row.score}</div>
            <div className={`text-[10px] font-bold leading-none ${getConfidenceStyle(row.confidence)}`}>{row.confidence}%</div>
            {densityMode === 'detailed' && <div className="mt-1">{
              row.score >= 90 ? <Badge variant="purple" className="shadow-[0_0_10px_rgba(139,92,246,0.15)]">Strong Buy</Badge> :
              row.score >= 70 ? <Badge variant="green" className="shadow-[0_0_10px_rgba(16,185,129,0.15)]">Opportunity</Badge> :
              row.score >= 40 ? <Badge variant="amber" className="shadow-[0_0_10px_rgba(245,158,11,0.15)]">Watch</Badge> :
              row.score >= 20 ? <Badge variant="gray">Ignore</Badge> :
              <Badge variant="red" className="shadow-[0_0_10px_rgba(239,68,68,0.15)]">Avoid</Badge>
            }</div>}
          </div>
        </td>
      )}

      {visibleColumns.includes('signalTime') && (
        <td className={cellPadding}>
          <span className="font-mono text-text-secondary">{row.signalTime || '—'}</span>
        </td>
      )}

      {visibleColumns.includes('gap') && (
        <td className={cellPadding}>
          {row.expectedGap !== null && row.expectedGap !== undefined ? (
            <span className="text-accent-green font-semibold">+{row.expectedGap}%</span>
          ) : (
            <span className="text-text-tertiary">Rejected</span>
          )}
        </td>
      )}

      {visibleColumns.includes('move') && (
        <td className={cellPadding}>
          {row.expectedMove !== null && row.expectedMove !== undefined ? (
            <span className="text-accent-blue font-semibold">+{row.expectedMove}%</span>
          ) : (
            <span className="text-text-tertiary">—</span>
          )}
        </td>
      )}

      {visibleColumns.includes('confidence') && (
        <td className={cellPadding}>
          {row.confidence !== null && row.confidence !== undefined ? (
            <div className="flex items-center gap-1">
              <div className="w-12 bg-bg-primary rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full ${row.confidence >= 80 ? 'bg-accent-green' : row.confidence >= 60 ? 'bg-accent-blue' : 'bg-accent-amber'}`} 
                  style={{ width: `${row.confidence}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-text-secondary">{row.confidence}%</span>
            </div>
          ) : (
            <span className="text-text-tertiary">—</span>
          )}
        </td>
      )}

      {visibleColumns.includes('exit') && (
        <td className={cellPadding}>
          {row.exitStrategy ? (
            <span className="px-2 py-0.5 rounded text-[10px] bg-accent-blue/20 text-accent-blue font-bold border border-accent-blue/30">{row.exitStrategy}</span>
          ) : (
            <span className="text-text-tertiary text-[10px] italic">{row.rejectionReason || '—'}</span>
          )}
        </td>
      )}

      <td className={`${cellPadding} text-right`}>
        <div className="flex items-center justify-end gap-1">
          {densityMode === 'detailed' ? (
            <>
              <Button
                onClick={() => onOpenDrawer(row)}
                size="sm"
                variant="ghost"
                className="px-1.5 py-0.5 h-6 text-[10px] text-accent-blue hover:bg-accent-blue/10 rounded font-bold"
                title="Analyze stock in details drawer"
              >
                Analyze
              </Button>
              
              <Button
                onClick={() => onToggleCompare(row.symbol)}
                size="sm"
                variant="ghost"
                className={`px-1.5 py-0.5 h-6 text-[10px] rounded font-bold ${
                  isSelected ? 'text-accent-purple bg-accent-purple/10' : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Toggle selection for compare basket"
              >
                {isSelected ? 'Selected' : 'Compare'}
              </Button>
              
              <Button
                onClick={() => onToggleWatchlist(row.symbol, 'starred')}
                size="sm"
                variant="ghost"
                className={`px-1.5 py-0.5 h-6 text-[10px] rounded font-bold ${
                  isStarred ? 'text-accent-amber bg-accent-amber/10' : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Watch / Star"
              >
                {isStarred ? 'Watching' : 'Watch'}
              </Button>

              <Button
                onClick={() => onChartRedirect(row)}
                size="sm"
                variant="ghost"
                className="px-1.5 py-0.5 h-6 text-[10px] text-accent-green hover:bg-accent-green/10 rounded font-bold"
                title="Open Level Chart in manual calculator"
              >
                Chart
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onOpenDrawer(row)}
                className="p-1 hover:bg-bg-tertiary rounded text-accent-blue"
                title="Analyze Stock"
              >
                <Search size={12} />
              </button>
              <button
                onClick={() => onToggleCompare(row.symbol)}
                className={`p-1 hover:bg-bg-tertiary rounded ${isSelected ? 'text-accent-purple' : 'text-text-secondary'}`}
                title="Compare"
              >
                <Layers size={12} />
              </button>
              <button
                onClick={() => onToggleWatchlist(row.symbol, 'starred')}
                className={`p-1 hover:bg-bg-tertiary rounded ${isStarred ? 'text-accent-amber' : 'text-text-secondary'}`}
                title="Star Watchlist"
              >
                <Star size={12} fill={isStarred ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={() => onChartRedirect(row)}
                className="p-1 hover:bg-bg-tertiary rounded text-accent-green"
                title="Open Chart"
              >
                <TrendingUp size={12} />
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
});
StockRow.displayName = 'StockRow';

export default function ScannerClient() {
  const router = useRouter();
  const { showToast } = useToast();

  // Filters & Pagination State
  const [universe, setUniverse] = useState<'NIFTY50' | 'NIFTY200' | 'NIFTY_FNO' | 'ALL'>('NIFTY50');
  const [market, setMarket] = useState<'NSE' | 'BSE'>('NSE');
  const [mode, setMode] = useState<string>('ALL');
  const [scannerMode, setScannerMode] = useState<'CPR' | 'BTST'>('CPR');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(10);
  const [sortField, setSortField] = useState<string>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // V2/V3 Advanced Filters
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [marketCapCategory, setMarketCapCategory] = useState<string>('ALL');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [minScore, setMinScore] = useState<string>('');
  const [maxScore, setMaxScore] = useState<string>('');
  const [minWidth, setMinWidth] = useState<string>('');
  const [maxWidth, setMaxWidth] = useState<string>('');

  // Table Configs: Density Mode & Column Visibility Show/Hide
  const [densityMode, setDensityMode] = useState<'compact' | 'detailed'>('detailed');
  const [showColumnSettings, setShowColumnSettings] = useState<boolean>(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    'checkbox',
    'watchlist',
    'symbol',
    'ltp',
    'distance',
    'width',
    'setup',
    'rr',
    'signals',
    'score',
    'action'
  ]);

  // Watchlist & Pins (stored in localStorage)
  const [watchlist, setWatchlist] = useState<Record<string, WatchlistItemState>>({});
  const [showWatchlistOnly, setShowWatchlistOnly] = useState<boolean>(false);

  // Auto Refresh Mode
  const [refreshInterval, setRefreshInterval] = useState<string>('Off'); // Off, 5m, 15m, 30m
  const [countdown, setCountdown] = useState<number>(0);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // KPI Bar Stats
  const [latency, setLatency] = useState<number>(0);

  // Comparison Multi-Select
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);

  // Main Scanned Data
  const [results, setResults] = useState<ScannedStock[]>([]);
  const [topStocks, setTopStocks] = useState<ScannedStock[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Custom Filters

  const [insightCounts, setInsightCounts] = useState({
    strongBuy: 0,
    breakoutReady: 0,
    avoid: 0
  });

  // persistent scan runs log
  const [scanHistoryLog, setScanHistoryLog] = useState<HistoryLog[]>([]);
  const [showLogsList, setShowLogsList] = useState<boolean>(false);

  // Quick Analyze Drawer State & Tab Selection
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerStock, setDrawerStock] = useState<ScannedStock | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'signals' | 'tradeSetup' | 'history' | 'compare' | 'notes'>('overview');
  const [drawerHistory, setDrawerHistory] = useState<{ date: string; ltp: number; width: number; score: number }[]>([]);
  const [isDrawerHistoryLoading, setIsDrawerHistoryLoading] = useState<boolean>(false);
  const [stockNotes, setStockNotes] = useState<string>('');

  // List of all column definitions for Show/Hide Checklist
  const COLUMN_DEFS = [
    { key: 'checkbox', label: 'Select Checkbox' },
    { key: 'watchlist', label: 'Watchlist Controls' },
    { key: 'symbol', label: 'Symbol & Sector' },
    { key: 'ltp', label: 'LTP & Change' },
    { key: 'distance', label: 'Distance to TC/BC' },
    { key: 'width', label: 'CPR Width %' },
    { key: 'setup', label: 'Trade setup (Entry/SL/Tgt)' },
    { key: 'rr', label: 'Risk Reward Ratio' },
    { key: 'signals', label: 'Active Signals' },
    { key: 'score', label: 'Score & Confidence' },
    { key: 'action', label: 'Inspection Action' },
    { key: 'signalTime', label: 'Signal Time' },
    { key: 'gap', label: 'Gap %' },
    { key: 'move', label: 'Move %' },
    { key: 'confidence', label: 'Confidence' },
    { key: 'exit', label: 'Exit / Status' }
  ];

  // Debounce search query input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load Watchlist and Column configurations on mount
  useEffect(() => {
    const savedWatchlist = localStorage.getItem('cpr_watchlist_v2');
    if (savedWatchlist) {
      try {
        setWatchlist(JSON.parse(savedWatchlist));
      } catch (err) {
        console.error('Failed to parse watchlist settings:', err);
      }
    }

    const savedColumns = localStorage.getItem('cpr_scanner_columns');
    if (savedColumns) {
      try {
        setVisibleColumns(JSON.parse(savedColumns));
      } catch (err) {
        console.error('Failed to parse visible columns:', err);
      }
    }

    const savedDensity = localStorage.getItem('cpr_scanner_density');
    if (savedDensity) {
      setDensityMode(savedDensity as 'compact' | 'detailed');
    }
  }, []);

  useEffect(() => {
    if (scannerMode === 'BTST') {
      setVisibleColumns(['symbol', 'signalTime', 'score', 'gap', 'move', 'confidence', 'exit']);
    } else {
      const savedColumns = localStorage.getItem('cpr_scanner_columns');
      if (savedColumns) {
        try {
          setVisibleColumns(JSON.parse(savedColumns));
        } catch {
          setVisibleColumns(['checkbox', 'watchlist', 'symbol', 'ltp', 'distance', 'width', 'setup', 'rr', 'signals', 'score']);
        }
      } else {
        setVisibleColumns(['checkbox', 'watchlist', 'symbol', 'ltp', 'distance', 'width', 'setup', 'rr', 'signals', 'score']);
      }
    }
  }, [scannerMode]);

  const saveWatchlistSettings = (updated: Record<string, WatchlistItemState>) => {
    setWatchlist(updated);
    localStorage.setItem('cpr_watchlist_v2', JSON.stringify(updated));
  };

  const handleToggleColumn = (key: string) => {
    let updated: string[];
    if (visibleColumns.includes(key)) {
      updated = visibleColumns.filter(c => c !== key);
    } else {
      updated = [...visibleColumns, key];
    }
    setVisibleColumns(updated);
    localStorage.setItem('cpr_scanner_columns', JSON.stringify(updated));
  };

  const toggleDensityMode = () => {
    const next = densityMode === 'detailed' ? 'compact' : 'detailed';
    setDensityMode(next);
    localStorage.setItem('cpr_scanner_density', next);
  };

  // Toggle watchlist configurations (Star, Pin, Notify)
  const handleToggleWatchlistState = async (symbol: string, key: keyof WatchlistItemState) => {
    const updated = { ...watchlist };
    const current = updated[symbol] ? { ...updated[symbol] } : { starred: false, pinned: false, notify: false };
    current[key] = !current[key];
    
    // Clean up empty configurations
    if (!current.starred && !current.pinned && !current.notify) {
      delete updated[symbol];
      try {
        await fetch(`/api/watchlist?symbol=${symbol}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to sync watchlist deletion with DB:', err);
      }
    } else {
      updated[symbol] = current;
      try {
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol }),
        });
        
        // Also update pinned/notify configurations
        await fetch('/api/watchlist', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol,
            pinned: current.pinned,
            notify: current.notify,
          }),
        });
      } catch (err) {
        console.error('Failed to sync watchlist updates with DB:', err);
      }
    }
    
    saveWatchlistSettings(updated);
    showToast(`${symbol} watchlist settings updated`, 'success');
  };

  // Fetch History Run logs
  const fetchHistoryRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/scanner/history');
      if (res.ok) {
        const data = await res.json();
        setScanHistoryLog(data.results);
      }
    } catch (err) {
      console.error('Failed to load history runs:', err);
    }
  }, []);

  // Main Fetch Function
  const fetchScannerData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const startFetchTime = Date.now();
    try {
      if (scannerMode === 'BTST') {
        const res = await fetch('/api/btst');
        if (!res.ok) throw new Error('Failed to retrieve BTST signals');
        const data = await res.json();
        
        const mapped = data.map((sig: {
          id: string;
          symbol: string;
          entry?: number | null;
          classification: string;
          state: string;
          btstScore?: number | null;
          stopLoss?: number | null;
          target?: number | null;
          confidence?: number | null;
          createdAt: string;
          signalTime: string;
          expectedGap?: number | null;
          expectedMove?: number | null;
          exitStrategy?: string | null;
          rejectionReason?: string | null;
          scoreBreakdown?: {
            vdu?: number;
            cprNarrow?: number;
            higherValue?: number;
            vwap?: number;
            conf15m?: number;
            closeStrength?: number;
          };
        }) => ({
          id: sig.id,
          symbol: sig.symbol,
          market: 'NSE' as const,
          sector: 'F&O Stock',
          price: sig.entry || 0,
          open: sig.entry || 0,
          volume: 0,
          avgVolume: 0,
          marketCap: 0,
          ltp: sig.entry || 0,
          pivot: 0,
          bc: 0,
          tc: 0,
          r1: 0,
          r2: 0,
          r3: 0,
          r4: 0,
          s1: 0,
          s2: 0,
          s3: 0,
          s4: 0,
          width: 0,
          classification: 'NORMAL' as const,
          btstClassification: sig.classification,
          signals: [sig.state],
          score: sig.btstScore || 0,
          entry: sig.entry || 0,
          sl: sig.stopLoss || 0,
          target: sig.target || 0,
          rr: '1:2.5',
          confidence: sig.confidence || 0,
          createdAt: sig.createdAt,
          signalTime: sig.signalTime,
          expectedGap: sig.expectedGap,
          expectedMove: sig.expectedMove,
          exitStrategy: sig.exitStrategy,
          state: sig.state,
          rejectionReason: sig.rejectionReason,
          volumeRatio: 1,
          scoreBreakdown: sig.scoreBreakdown || {}
        }));

        setResults(mapped);
        setTotal(mapped.length);
        setTotalPages(1);
        setLatency(Date.now() - startFetchTime);
        setLastRefreshed(new Date().toLocaleTimeString());
        return;
      }

      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        market,
        universe,
        mode,
        sortField,
        sortOrder,
        sector: selectedSector,
        marketCapCategory,
        ...(minPrice && { minPrice }),
        ...(maxPrice && { maxPrice }),
        ...(minScore && { minScore }),
        ...(maxScore && { maxScore }),
        ...(minWidth && { minWidth }),
        ...(maxWidth && { maxWidth }),
      });

      const res = await fetch(`/api/scanner?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Failed to retrieve scanning coordinates');

      const data = await res.json();
      if (data.success) {
        if (data.insights) {
          setInsightCounts(data.insights);
        }
        let items = data.results as ScannedStock[];

        // Client-side watchlist only filter
        if (showWatchlistOnly) {
          items = items.filter(r => watchlist[r.symbol]?.starred);
        }

        // Client-side text search filter (symbol and sector aliases)
        if (debouncedSearchQuery.trim() !== '') {
          const query = debouncedSearchQuery.toLowerCase().trim();
          items = items.filter(r => {
            const matchesSymbol = r.symbol.toLowerCase().includes(query);
            const matchesSector = r.sector.toLowerCase().includes(query);
            
            // Check sector aliases
            const aliases = SECTOR_ALIASES[r.sector] || [];
            const matchesAlias = aliases.some(alias => alias.includes(query) || query.includes(alias));
            
            return matchesSymbol || matchesSector || matchesAlias;
          });
        }

        // Apply watchlist Pinned priority layout logic & dynamic column sorting
        items.sort((a, b) => {
          const pinA = watchlist[a.symbol]?.pinned ? 1 : 0;
          const pinB = watchlist[b.symbol]?.pinned ? 1 : 0;
          if (pinA !== pinB) return pinB - pinA; // pinned first
          
          let comparison = 0;
          if (sortField === 'score') {
            comparison = a.score - b.score;
          } else if (sortField === 'symbol') {
            comparison = a.symbol.localeCompare(b.symbol);
          } else if (sortField === 'ltp') {
            comparison = a.ltp - b.ltp;
          } else if (sortField === 'width') {
            comparison = a.width - b.width;
          }
          
          return sortOrder === 'desc' ? -comparison : comparison;
        });

        setResults(items);
        setTotal(showWatchlistOnly || debouncedSearchQuery ? items.length : data.total);
        setTotalPages(showWatchlistOnly || debouncedSearchQuery ? Math.ceil(items.length / limit) : data.totalPages);
        setLatency(Date.now() - startFetchTime);

        if (items.length > 0 && !lastRefreshed) {
          setLastRefreshed(new Date(items[0].createdAt).toLocaleTimeString());
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Scan query failed', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, market, universe, mode, sortField, sortOrder, selectedSector, marketCapCategory, minPrice, maxPrice, minScore, maxScore, minWidth, maxWidth, showWatchlistOnly, watchlist, debouncedSearchQuery, lastRefreshed, showToast, scannerMode]);

  // Fetch Top opportunities
  const fetchTopOpportunities = useCallback(async () => {
    try {
      const res = await fetch(`/api/scanner/top?limit=4&market=${market}`);
      if (res.ok) {
        const data = await res.json();
        setTopStocks(data.results);
      }
    } catch (err) {
      console.error('Failed to load top opportunities:', err);
    }
  }, [market]);

  // Recalculate Scan runs
  const handleScanRefresh = useCallback(async () => {
    setIsRefreshing(true);
    showToast('Executing scanner algorithm...', 'info');
    const startFetchTime = Date.now();
    try {
      const res = await fetch('/api/scanner/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universe, market }),
      });

      if (!res.ok) throw new Error('Recalculation failed');
      const data = await res.json();
      if (data.success) {
        setLastRefreshed(new Date().toLocaleTimeString());
        setLatency(Date.now() - startFetchTime);
        showToast(`Scan complete! Calculated ${data.count} opportunity targets.`, 'success');
        fetchScannerData(true); // silent background load
        fetchTopOpportunities();
        fetchHistoryRuns();
        
        // Reset countdown clock
        if (refreshInterval !== 'Off') {
          setCountdown(parseInt(refreshInterval, 10) * 60);
        }
      }
    } catch {
      showToast('Scan refresh error, check network connectivity.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [universe, market, refreshInterval, fetchScannerData, fetchTopOpportunities, fetchHistoryRuns, showToast]);

  // Setup Auto-Refresh Countdown clock & trigger
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    if (refreshInterval !== 'Off') {
      const minutes = parseInt(refreshInterval, 10);
      const totalSeconds = minutes * 60;
      setCountdown(totalSeconds);

      // 1. Every second countdown updates
      countdownTimerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            // Trigger refresh at 0
            handleScanRefresh();
            return totalSeconds;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [refreshInterval, handleScanRefresh]);

  useEffect(() => {
    fetchScannerData();
  }, [fetchScannerData, debouncedSearchQuery]);

  useEffect(() => {
    fetchTopOpportunities();
    fetchHistoryRuns();
  }, [fetchTopOpportunities, fetchHistoryRuns]);

  const handleFilterChange = (type: 'universe' | 'market' | 'mode', value: string) => {
    setPage(1);
    if (type === 'universe') setUniverse(value as 'NIFTY50' | 'NIFTY200' | 'NIFTY_FNO' | 'ALL');
    if (type === 'market') setMarket(value as 'NSE' | 'BSE');
    if (type === 'mode') setMode(value);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  // Open Quick Analyze Drawer & Load notes/history
  const handleOpenDrawer = async (stock: ScannedStock) => {
    setDrawerStock(stock);
    setDrawerOpen(true);
    setDrawerTab('overview');
    setIsDrawerHistoryLoading(true);

    const savedNotes = localStorage.getItem(`cpr_stock_notes_${stock.symbol}`) || '';
    setStockNotes(savedNotes);

    try {
      const res = await fetch(`/api/stock/${stock.symbol}`);
      if (res.ok) {
        const data = await res.json();
        setDrawerHistory(data.history || []);
      }
    } catch (err) {
      console.error('Failed to load drawer history:', err);
    } finally {
      setIsDrawerHistoryLoading(false);
    }
  };

  // Save stock user notes
  const handleSaveNotes = (val: string) => {
    setStockNotes(val);
    if (drawerStock) {
      localStorage.setItem(`cpr_stock_notes_${drawerStock.symbol}`, val);
    }
  };

  // Multi-stock compare selection (capped at 5)
  const handleToggleCompareCheckbox = (symbol: string) => {
    if (compareSymbols.includes(symbol)) {
      setCompareSymbols(compareSymbols.filter(s => s !== symbol));
    } else {
      if (compareSymbols.length >= 5) {
        showToast('Maximum comparison basket size is 5 stocks.', 'info');
        return;
      }
      setCompareSymbols([...compareSymbols, symbol]);
    }
  };

  const executeCompareRedirect = () => {
    if (compareSymbols.length === 0) return;
    router.push(`/compare?symbols=${compareSymbols.join(',')}`);
  };

  // Load past history run
  const handleLoadPastScan = (log: HistoryLog) => {
    showToast(`Loading scan run from ${new Date(log.createdAt).toLocaleTimeString()}`, 'info');
    if (log.filters.universe) setUniverse(log.filters.universe as 'NIFTY50' | 'NIFTY200' | 'ALL');
    if (log.filters.market) setMarket(log.filters.market as 'NSE' | 'BSE');
    setShowLogsList(false);
    fetchScannerData();
  };

  // Format Auto-Refresh Timer Countdown String
  const formatCountdown = () => {
    if (refreshInterval === 'Off') return 'Off';
    const m = Math.floor(countdown / 60);
    const s = countdown % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  // Standardized V3 category labels and styling
  const getRatingBadge = (score: number) => {
    if (score >= 90) return <Badge variant="purple" className="shadow-[0_0_10px_rgba(139,92,246,0.15)]">Strong Buy</Badge>;
    if (score >= 70) return <Badge variant="green" className="shadow-[0_0_10px_rgba(16,185,129,0.15)]">Opportunity</Badge>;
    if (score >= 40) return <Badge variant="amber" className="shadow-[0_0_10px_rgba(245,158,11,0.15)]">Watch</Badge>;
    if (score >= 20) return <Badge variant="gray">Ignore</Badge>;
    return <Badge variant="red" className="shadow-[0_0_10px_rgba(239,68,68,0.15)]">Avoid</Badge>;
  };

  // Standardized V3 color selectors
  const getRatingColorClass = (score: number) => {
    if (score >= 90) return 'text-accent-purple border-accent-purple/30 bg-accent-purple/10';
    if (score >= 70) return 'text-accent-green border-accent-green/30 bg-accent-green/10';
    if (score >= 40) return 'text-accent-amber border-accent-amber/30 bg-accent-amber/10';
    if (score >= 20) return 'text-text-secondary border-border-tertiary bg-bg-tertiary';
    return 'text-accent-red border-accent-red/30 bg-accent-red/10';
  };

  // Heatmap Aggregator with Row and Column Totals
  const heatmapGridData = useMemo(() => {
    const grid: Record<string, Record<string, { count: number; avgScore: number; symbols: string[]; topStock: string; topStockScore: number }>> = {};
    const colTotals: Record<string, { count: number; avgScore: number; symbols: string[]; topStock: string; topStockScore: number }> = {
      'Strong Buy': { count: 0, avgScore: 0, symbols: [], topStock: '', topStockScore: 0 },
      'Breakout': { count: 0, avgScore: 0, symbols: [], topStock: '', topStockScore: 0 },
      'Bullish': { count: 0, avgScore: 0, symbols: [], topStock: '', topStockScore: 0 },
      'Bearish': { count: 0, avgScore: 0, symbols: [], topStock: '', topStockScore: 0 },
      'Watch': { count: 0, avgScore: 0, symbols: [], topStock: '', topStockScore: 0 },
    };

    SECTORS_LIST.forEach(sec => {
      grid[sec] = {
        'Strong Buy': { count: 0, avgScore: 0, symbols: [], topStock: '', topStockScore: 0 },
        'Breakout': { count: 0, avgScore: 0, symbols: [], topStock: '', topStockScore: 0 },
        'Bullish': { count: 0, avgScore: 0, symbols: [], topStock: '', topStockScore: 0 },
        'Bearish': { count: 0, avgScore: 0, symbols: [], topStock: '', topStockScore: 0 },
        'Watch': { count: 0, avgScore: 0, symbols: [], topStock: '', topStockScore: 0 },
        'Total': { count: 0, avgScore: 0, symbols: [], topStock: '', topStockScore: 0 }
      };
    });

    results.forEach(item => {
      const sec = item.sector;
      if (!grid[sec]) return;

      const signals = item.signals;
      const score = item.score;

      const checkAndAddCell = (cellKey: string) => {
        const cell = grid[sec][cellKey];
        cell.avgScore = (cell.avgScore * cell.count + score) / (cell.count + 1);
        cell.count += 1;
        cell.symbols.push(item.symbol);
        if (score > cell.topStockScore) {
          cell.topStock = item.symbol;
          cell.topStockScore = score;
        }

        // Row Total Increment
        const rowTotal = grid[sec]['Total'];
        rowTotal.count += 1;
        if (!rowTotal.symbols.includes(item.symbol)) {
          rowTotal.symbols.push(item.symbol);
        }
        rowTotal.avgScore = (rowTotal.avgScore * (rowTotal.count - 1) + score) / rowTotal.count;
        if (score > rowTotal.topStockScore) {
          rowTotal.topStock = item.symbol;
          rowTotal.topStockScore = score;
        }

        // Column Total Increment
        const colTotal = colTotals[cellKey];
        colTotal.count += 1;
        colTotal.avgScore = (colTotal.avgScore * (colTotal.count - 1) + score) / colTotal.count;
        colTotal.symbols.push(item.symbol);
        if (score > colTotal.topStockScore) {
          colTotal.topStock = item.symbol;
          colTotal.topStockScore = score;
        }
      };

      if (score >= 90) checkAndAddCell('Strong Buy');
      if (signals.includes('BREAKOUT')) checkAndAddCell('Breakout');
      if (signals.includes('BULLISH')) checkAndAddCell('Bullish');
      if (signals.includes('BEARISH')) checkAndAddCell('Bearish');
      if (score >= 40 && score < 70) checkAndAddCell('Watch');
    });

    return { grid, colTotals };
  }, [results]);

  // V2 Scanner Insights
  const strongBuyCount = insightCounts.strongBuy;
  const breakoutReadyCount = insightCounts.breakoutReady;
  const watchlistCount = Object.keys(watchlist).filter(k => watchlist[k]?.starred).length;
  const avoidCount = insightCounts.avoid;

  // KPI calculations
  const totalActiveSignals = useMemo(() => {
    return results.reduce((sum, item) => sum + item.signals.length, 0);
  }, [results]);

  const averageUniverseScore = useMemo(() => {
    if (results.length === 0) return 0;
    return results.reduce((sum, item) => sum + item.score, 0) / results.length;
  }, [results]);

  const btstMetrics = useMemo(() => {
    if (scannerMode !== 'BTST' || results.length === 0) return { ready: 0, strong: 0, avgGap: 0, avgConf: 0 };
    let ready = 0, strong = 0, gapSum = 0, confSum = 0;
    results.forEach(r => {
      ready++;
      if (r.btstClassification === 'STRONG_BTST') strong++;
      gapSum += r.expectedGap || 0;
      confSum += r.confidence || 0;
    });
    return {
      ready,
      strong,
      avgGap: gapSum / results.length,
      avgConf: confSum / results.length
    };
  }, [results, scannerMode]);

  return (
    <div className="space-y-6 relative pb-20 terminal-grid">
      
      {scannerMode === 'BTST' && <BtstStateBanner />}

      {/* V3 KPI Top status bar */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg px-4 py-2.5 font-mono text-[11px] grid grid-cols-2 sm:grid-cols-6 items-center gap-3 text-text-secondary">
        <div className="flex items-center gap-1.5 border-r border-border-primary/50 last:border-none pr-2">
          <Layers size={13} className="text-accent-blue" />
          <span>Universe:</span>
          <span className="font-bold text-text-primary uppercase">
            {universe === 'NIFTY_FNO' ? 'NSE F&O' : universe}
          </span>
        </div>
        <div className="flex items-center gap-1.5 border-r border-border-primary/50 last:border-none pr-2">
          <Activity size={13} className="text-accent-green" />
          <span>Active Signals:</span>
          <span className="font-bold text-text-primary">{totalActiveSignals}</span>
        </div>
        <div className="flex items-center gap-1.5 border-r border-border-primary/50 last:border-none pr-2">
          <Award size={13} className="text-accent-purple" />
          <span>Avg Score:</span>
          <span className="font-bold text-text-primary">{averageUniverseScore.toFixed(1)}</span>
        </div>
        <div className="flex items-center gap-1.5 border-r border-border-primary/50 last:border-none pr-2">
          <Clock size={13} className="text-accent-amber" />
          <span>Refresh:</span>
          <span className="font-bold text-text-primary uppercase">{isLoading || isRefreshing ? 'Scanning' : 'Idle'}</span>
        </div>
        <div className="flex items-center gap-1.5 border-r border-border-primary/50 last:border-none pr-2">
          <TrendingUp size={13} className="text-accent-blue" />
          <span>Latency:</span>
          <span className="font-bold text-text-primary">{latency}ms</span>
        </div>
        {/* Live Data Badge */}
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-green animate-pulse" />
          <span className="font-bold text-accent-green uppercase tracking-wide">LIVE</span>
          <span className="text-text-tertiary text-[9px]">Yahoo Finance</span>
        </div>
      </div>

      {/* V3 Top Tickers marquee */}
      {topStocks.length > 0 && (
        <div className="bg-bg-secondary/40 border border-border-primary/50 rounded-lg px-4 py-2 font-mono text-[10px] text-text-secondary flex flex-wrap items-center gap-2">
          <Sparkles size={12} className="text-accent-purple animate-pulse" />
          <span className="font-bold text-text-primary uppercase tracking-wider">Top Algo Matches:</span>
          <div className="flex flex-wrap items-center gap-2">
            {topStocks.map((s, idx) => (
              <span key={s.symbol} className="flex items-center gap-1">
                <span className="text-text-primary font-bold">{s.symbol}</span>
                <span className="text-text-tertiary">({s.score} pts)</span>
                {idx < topStocks.length - 1 && <span className="text-text-tertiary">|</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* V2 Dashboard Hero */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-5 font-mono relative overflow-hidden select-none">
        <div className="absolute top-0 right-0 h-full w-1/3 opacity-[0.03] pointer-events-none select-none">
          <Radar className="h-full w-full stroke-[0.5] animate-pulse" />
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <span className="text-[10px] text-accent-blue font-bold uppercase tracking-widest flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent-blue animate-pulse" />
              Automated Discovery Engine V3
            </span>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary uppercase">
              CPR Opportunity Scanner
            </h1>
            <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
              Auto-scans indices, evaluates 11 critical CPR rules, and ranks targets dynamically using dynamic filters, heatmap matrixes, and V3 scoring calibrations.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Auto refresh display countdown info */}
            <div className="bg-bg-primary border border-border-primary/80 rounded px-2.5 py-1.5 text-[10px] flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 border-r border-border-primary/50 pr-3">
                <Clock size={12} className="text-text-tertiary" />
                <div className="space-y-0.5 leading-none">
                  <span className="block text-[8px] text-text-tertiary uppercase">Last Refresh</span>
                  <span className="font-bold text-text-primary">{lastRefreshed || '—'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <RefreshCw size={12} className="text-text-tertiary" />
                <div className="space-y-0.5 leading-none">
                  <span className="block text-[8px] text-text-tertiary uppercase">Next Refresh</span>
                  <span className="font-bold text-text-primary">{formatCountdown()}</span>
                </div>
              </div>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
                className="bg-bg-secondary border border-border-secondary text-text-secondary font-bold focus:outline-none cursor-pointer p-1 rounded text-[9px]"
              >
                <option value="Off">Interval: Off</option>
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="30m">30m</option>
              </select>
            </div>
            
            <Button
              onClick={() => setShowLogsList(!showLogsList)}
              size="sm"
              variant="secondary"
              className="text-[10px] h-9"
            >
              Scan Run Logs ({scanHistoryLog.length})
            </Button>
            
            <Button
              onClick={handleScanRefresh}
              disabled={isRefreshing}
              size="sm"
              variant="primary"
              className="flex items-center gap-2 h-9"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Scanning...' : 'Scan Market'}
            </Button>
          </div>
        </div>
      </div>

      {/* Persistence history runs panel */}
      {showLogsList && (
        <Card title="Scanner Run History Log" icon={<Clock size={14} className="text-accent-blue" />}>
          {scanHistoryLog.length === 0 ? (
            <p className="text-xs text-text-secondary font-mono">No past logs stored in database.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 font-mono text-[11px]">
              {scanHistoryLog.map((log) => (
                <div 
                  key={log.id} 
                  className="bg-bg-secondary/60 border border-border-primary hover:border-border-secondary p-3 rounded cursor-pointer transition-colors"
                  onClick={() => handleLoadPastScan(log)}
                >
                  <div className="flex justify-between font-bold text-text-primary">
                    <span>Scan Run #{log.id.slice(-4)}</span>
                    <span className="text-accent-blue">{log.resultCount} matched</span>
                  </div>
                  <div className="text-text-secondary mt-1.5 space-y-1">
                    <div>Filters: {log.filters.universe || 'ALL'} | {log.filters.market || 'NSE'}</div>
                    <div>Execution time: {log.durationMs}ms</div>
                    <div className="text-[10px] text-text-tertiary truncate">Top tickers: {log.topSymbols}</div>
                    <div className="text-[9px] text-text-tertiary border-t border-border-primary/50 pt-1 mt-1">
                      {new Date(log.createdAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* V3 Insights Cards */}
      {scannerMode === 'BTST' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
          <div className="bg-bg-secondary/40 border border-border-primary p-4 rounded-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-text-tertiary uppercase">BTST Ready</span>
              <h2 className="text-2xl font-bold text-accent-blue">{btstMetrics.ready}</h2>
            </div>
            <div className="h-10 w-10 rounded bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-accent-blue">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="bg-bg-secondary/40 border border-border-primary p-4 rounded-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-text-tertiary uppercase">Strong BTST</span>
              <h2 className="text-2xl font-bold text-accent-green">{btstMetrics.strong}</h2>
            </div>
            <div className="h-10 w-10 rounded bg-accent-green/10 border border-accent-green/20 flex items-center justify-center text-accent-green">
              <Award size={18} />
            </div>
          </div>
          <div className="bg-bg-secondary/40 border border-border-primary p-4 rounded-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-text-tertiary uppercase">Avg Expected Gap %</span>
              <h2 className="text-2xl font-bold text-accent-purple">+{btstMetrics.avgGap.toFixed(2)}%</h2>
            </div>
            <div className="h-10 w-10 rounded bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center text-accent-purple">
              <Activity size={18} />
            </div>
          </div>
          <div className="bg-bg-secondary/40 border border-border-primary p-4 rounded-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-text-tertiary uppercase">Avg Confidence</span>
              <h2 className="text-2xl font-bold text-accent-amber">{btstMetrics.avgConf.toFixed(1)}%</h2>
            </div>
            <div className="h-10 w-10 rounded bg-accent-amber/10 border border-accent-amber/20 flex items-center justify-center text-accent-amber">
              <Target size={18} />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
          <div className="bg-bg-secondary/40 border border-border-primary p-4 rounded-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-text-tertiary uppercase">Strong Buy (&gt;=90)</span>
              <h2 className="text-2xl font-bold text-accent-purple">{strongBuyCount}</h2>
            </div>
            <div className="h-10 w-10 rounded bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center text-accent-purple">
              <Award size={18} />
            </div>
          </div>

          <div className="bg-bg-secondary/40 border border-border-primary p-4 rounded-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-text-tertiary uppercase">Breakout Ready</span>
              <h2 className="text-2xl font-bold text-accent-green">{breakoutReadyCount}</h2>
            </div>
            <div className="h-10 w-10 rounded bg-accent-green/10 border border-accent-green/20 flex items-center justify-center text-accent-green">
              <TrendingUp size={18} />
            </div>
          </div>

          <div className="bg-bg-secondary/40 border border-border-primary p-4 rounded-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-text-tertiary uppercase">Watchlist Items</span>
              <h2 className="text-2xl font-bold text-accent-amber">{watchlistCount}</h2>
            </div>
            <div className="h-10 w-10 rounded bg-accent-amber/10 border border-accent-amber/20 flex items-center justify-center text-accent-amber">
              <Star size={18} fill="currentColor" />
            </div>
          </div>

          <div className="bg-bg-secondary/40 border border-border-primary p-4 rounded-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-text-tertiary uppercase">Avoid / Ignore</span>
              <h2 className="text-2xl font-bold text-accent-red">{avoidCount}</h2>
            </div>
            <div className="h-10 w-10 rounded bg-accent-red/10 border border-accent-red/20 flex items-center justify-center text-accent-red">
              <AlertTriangle size={18} />
            </div>
          </div>
        </div>
      )}

      {/* Sector Signal Heatmap Grid */}
      <Card title="Market Sector Concentration Heatmap" icon={<LayoutGrid size={14} className="text-accent-blue" />}>
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center font-mono select-none">
            <LayoutGrid size={32} className="text-accent-blue/30 mb-2 animate-pulse" />
            <p className="text-xs text-text-primary font-bold">Heatmap Empty</p>
            <p className="text-[9px] text-text-secondary mt-1 max-w-[280px]">
              No stocks match the filters to populate sector concentrations.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-[10px] select-none text-center">
              <thead>
                <tr className="border-b border-border-primary bg-bg-secondary text-text-secondary uppercase">
                  <th className="p-2.5 text-left w-36">Sector</th>
                  <th className="p-2.5">Strong Buy (&gt;=90)</th>
                  <th className="p-2.5">Breakout</th>
                  <th className="p-2.5">Bullish</th>
                  <th className="p-2.5">Bearish</th>
                  <th className="p-2.5">Watch (40-69)</th>
                  <th className="p-2.5 bg-bg-primary text-text-primary">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-primary/50">
                {SECTORS_LIST.map(sectorName => {
                  const row = heatmapGridData.grid[sectorName] || {};
                  return (
                    <tr key={sectorName} className="hover:bg-bg-tertiary/20">
                      <td className="p-2.5 font-bold text-text-primary text-left bg-bg-secondary/10">{sectorName}</td>
                      {Object.keys(row).filter(k => k !== 'Total').map(sig => {
                        const cell = row[sig];
                        const count = cell.count;
                        
                        let bgClass = 'bg-transparent';
                        let textClass = 'text-text-tertiary';
                        if (count > 0) {
                          textClass = 'text-text-primary font-bold';
                          if (sig === 'Strong Buy' || sig === 'Breakout') {
                            bgClass = count >= 3 ? 'bg-accent-purple/30' : 'bg-accent-purple/10';
                          } else if (sig === 'Bullish') {
                            bgClass = count >= 3 ? 'bg-accent-green/30' : 'bg-accent-green/10';
                          } else if (sig === 'Bearish') {
                            bgClass = count >= 3 ? 'bg-accent-red/30' : 'bg-accent-red/10';
                          } else {
                            bgClass = count >= 3 ? 'bg-accent-amber/30' : 'bg-accent-amber/10';
                          }
                        }

                        return (
                          <td 
                            key={sig} 
                            className={`p-2.5 border-l border-border-primary/30 transition-all cursor-help ${bgClass} ${textClass}`}
                            title={`Avg Score: ${cell.avgScore.toFixed(0)} | Top Stock: ${cell.topStock || 'N/A'} (Score: ${cell.topStockScore}) | Symbols: ${cell.symbols.join(', ')}`}
                          >
                            <span className="block font-semibold">{count}</span>
                            {count > 0 && (
                              <span className="block text-[8px] text-text-secondary mt-0.5 truncate max-w-[80px] mx-auto">
                                {cell.symbols.slice(0, 2).join(',')}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      {/* Row Total */}
                      <td 
                        className="p-2.5 border-l border-border-primary font-bold bg-bg-secondary/35 text-text-primary cursor-help"
                        title={`Avg Score: ${row.Total?.avgScore.toFixed(0) || 0} | Top Stock: ${row.Total?.topStock || 'N/A'} (Score: ${row.Total?.topStockScore || 0})`}
                      >
                        {row.Total?.count || 0}
                      </td>
                    </tr>
                  );
                })}
                {/* Column Totals Row */}
                <tr className="bg-bg-secondary border-t-2 border-border-primary font-bold text-text-primary text-[10px]">
                  <td className="p-2.5 text-left font-bold bg-bg-primary/20">TOTALS</td>
                  {Object.keys(heatmapGridData.colTotals).map(sig => {
                    const colTotal = heatmapGridData.colTotals[sig];
                    return (
                      <td 
                        key={sig} 
                        className="p-2.5 border-l border-border-primary/30 cursor-help"
                        title={`Avg Score: ${colTotal.avgScore.toFixed(0)} | Top Stock: ${colTotal.topStock || 'N/A'} (Score: ${colTotal.topStockScore}) | Symbols: ${colTotal.symbols.join(', ')}`}
                      >
                        {colTotal.count}
                      </td>
                    );
                  })}
                  <td className="p-2.5 border-l border-border-primary text-accent-blue font-extrabold bg-bg-primary/30">
                    {results.length}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Main Terminal Scanner Controls and Table */}
      <Card 
        title="Active Scanner Board" 
        icon={<Radar size={14} className="text-accent-blue" />}
        headerAction={
          <div className="flex items-center gap-1">
            <Button
              onClick={() => setScannerMode(scannerMode === 'CPR' ? 'BTST' : 'CPR')}
              size="sm"
              variant="secondary"
              className={`text-[10px] h-7 font-bold ${scannerMode === 'BTST' ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/50' : ''}`}
            >
              Mode: {scannerMode}
            </Button>
            <Button
              onClick={toggleDensityMode}
              size="sm"
              variant="ghost"
              className="text-[10px] h-7"
            >
              Density: {densityMode === 'detailed' ? 'Detailed' : 'Compact'}
            </Button>
            <div className="relative">
              <Button
                onClick={() => setShowColumnSettings(!showColumnSettings)}
                size="sm"
                variant="ghost"
                className="text-[10px] h-7 flex items-center gap-1.5"
              >
                Columns
              </Button>
              {showColumnSettings && (
                <div className="absolute right-0 mt-1.5 w-[200px] bg-bg-secondary border border-border-secondary p-3 rounded shadow-lg z-30 font-mono text-[10px] space-y-2">
                  <div className="font-bold text-text-primary border-b border-border-primary pb-1 flex justify-between items-center">
                    <span>Show/Hide Columns</span>
                    <button onClick={() => setShowColumnSettings(false)} className="text-text-tertiary hover:text-text-primary">
                      <X size={10} />
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                    {COLUMN_DEFS.filter(c => c.key !== 'checkbox' && c.key !== 'action').map(col => (
                      <label key={col.key} className="flex items-center gap-2 cursor-pointer text-text-secondary hover:text-text-primary">
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(col.key)}
                          onChange={() => handleToggleColumn(col.key)}
                          className="rounded text-accent-blue cursor-pointer"
                        />
                        <span>{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          
          {/* V2/V3 Advanced Filters board */}
          <div className="bg-bg-primary/50 border border-border-primary rounded p-4 font-mono text-xs space-y-4 max-sm:sticky max-sm:top-14 max-sm:z-20 max-sm:bg-bg-secondary">
            <span className="font-semibold text-text-primary flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
              <Activity size={13} className="text-accent-blue" />
              Advanced Scanner Filters
            </span>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              
              {/* Universe */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-tertiary uppercase">Universe</span>
                <select
                  value={universe}
                  onChange={(e) => handleFilterChange('universe', e.target.value)}
                  className="bg-bg-secondary border border-border-secondary text-text-primary px-2.5 py-1.5 rounded focus:outline-none focus:border-accent-blue cursor-pointer"
                >
                  <option value="NIFTY50">Nifty 50 (50)</option>
                  <option value="NIFTY200">Nifty 200</option>
                  <option value="NIFTY_FNO">NSE F&amp;O (~202)</option>
                  <option value="ALL">All Stocks</option>
                </select>
              </div>

              {/* Market */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-tertiary uppercase">Exchange</span>
                <select
                  value={market}
                  onChange={(e) => handleFilterChange('market', e.target.value)}
                  className="bg-bg-secondary border border-border-secondary text-text-primary px-2.5 py-1.5 rounded focus:outline-none focus:border-accent-blue cursor-pointer"
                >
                  <option value="NSE">NSE (India)</option>
                  <option value="BSE">BSE (India)</option>
                </select>
              </div>

              {/* Sector */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-tertiary uppercase">Sector</span>
                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="bg-bg-secondary border border-border-secondary text-text-primary px-2.5 py-1.5 rounded focus:outline-none focus:border-accent-blue cursor-pointer"
                >
                  <option value="ALL">All Sectors</option>
                  {SECTORS_LIST.map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>

              {/* Market Cap Category */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-tertiary uppercase">Market Cap</span>
                <select
                  value={marketCapCategory}
                  onChange={(e) => setMarketCapCategory(e.target.value)}
                  className="bg-bg-secondary border border-border-secondary text-text-primary px-2.5 py-1.5 rounded focus:outline-none focus:border-accent-blue cursor-pointer"
                >
                  <option value="ALL">All Sizes</option>
                  <option value="LARGE">Large Cap (&gt;20k Cr)</option>
                  <option value="MID">Mid Cap (5k-20k Cr)</option>
                  <option value="SMALL">Small Cap (&lt;5k Cr)</option>
                </select>
              </div>

              {/* Search query (supports partial symbols, sectors) */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-tertiary uppercase">Quick Search</span>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Symbol, Sector..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-bg-secondary border border-border-secondary text-text-primary pl-8 pr-3 py-1.5 rounded focus:outline-none focus:border-accent-blue w-full"
                  />
                  <Search size={12} className="absolute left-2.5 top-2.5 text-text-tertiary" />
                </div>
              </div>

              {/* Price Ranges */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-tertiary uppercase">Price Min/Max</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="Min"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2"
                  />
                </div>
              </div>

              {/* Score Ranges */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-tertiary uppercase">Score Min/Max</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    placeholder="Min"
                    value={minScore}
                    onChange={(e) => setMinScore(e.target.value)}
                    className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={maxScore}
                    onChange={(e) => setMaxScore(e.target.value)}
                    className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2"
                  />
                </div>
              </div>

              {/* CPR Width Ranges */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-tertiary uppercase">Width % Min/Max</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Min"
                    value={minWidth}
                    onChange={(e) => setMinWidth(e.target.value)}
                    className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Max"
                    value={maxWidth}
                    onChange={(e) => setMaxWidth(e.target.value)}
                    className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2"
                  />
                </div>
              </div>

              {/* Active Signal filters */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-text-tertiary uppercase">Active Signal</span>
                <select
                  value={mode}
                  onChange={(e) => handleFilterChange('mode', e.target.value)}
                  className="bg-bg-secondary border border-border-secondary text-text-primary px-2.5 py-1.5 rounded focus:outline-none focus:border-accent-blue cursor-pointer"
                >
                  <option value="ALL">All Signals</option>
                  <option value="NARROW">Narrow CPR</option>
                  <option value="WIDE">Wide CPR</option>
                  <option value="NORMAL">Normal CPR</option>
                  <option value="BULLISH">Bullish Bias</option>
                  <option value="BEARISH">Bearish Bias</option>
                  <option value="INSIDE">Inside CPR</option>
                  <option value="BREAKOUT">Breakout</option>
                  <option value="VIRGIN">Virgin CPR</option>
                  <option value="GAP_UP">Gap Up</option>
                  <option value="GAP_DOWN">Gap Down</option>
                  <option value="VOLUME_SPIKE">Volume Spike</option>
                  <option value="MOMENTUM">Momentum</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <button
                  onClick={() => {
                    setShowWatchlistOnly(!showWatchlistOnly);
                    setPage(1);
                  }}
                  className={`flex items-center justify-center gap-1.5 w-full py-2 rounded border text-[11px] font-bold transition-all ${
                    showWatchlistOnly
                      ? 'bg-accent-amber/10 border-accent-amber/30 text-accent-amber'
                      : 'bg-bg-secondary border-border-secondary text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Star size={12} fill={showWatchlistOnly ? 'currentColor' : 'none'} />
                  Starred Only
                </button>
              </div>
            </div>
          </div>

          {/* BTST Telemetry Panel */}
          {scannerMode === 'BTST' && (
            <div className="bg-bg-primary/30 border border-border-primary rounded p-4 font-mono text-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-text-secondary">
                <Activity size={13} className="text-accent-blue" />
                Live Telemetry
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px]">
                <div className="flex items-center gap-1.5 border-r border-border-primary/50 pr-4">
                  <span className="text-text-tertiary">Discovery State:</span>
                  <div className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${
                      new Date().getHours() * 100 + new Date().getMinutes() < 1515 ? 'bg-accent-amber' : 
                      new Date().getHours() * 100 + new Date().getMinutes() < 1525 ? 'bg-accent-green animate-pulse' : 'bg-accent-red'
                    }`} />
                    <span className="font-bold text-text-primary uppercase">
                      {new Date().getHours() * 100 + new Date().getMinutes() < 1515 ? 'PREMARKET' : 
                       new Date().getHours() * 100 + new Date().getMinutes() < 1525 ? 'ACTIVE' : 'FROZEN'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 border-r border-border-primary/50 pr-4">
                  <span className="text-text-tertiary">Candidates:</span>
                  <span className="font-bold text-accent-blue">{results.length}</span>
                </div>
                <div className="flex items-center gap-1.5 border-r border-border-primary/50 pr-4">
                  <span className="text-text-tertiary">Rejected:</span>
                  <span className="font-bold text-accent-red">{results.filter(r => r.rejectionReason).length}</span>
                </div>
                <div className="flex items-center gap-1.5 border-r border-border-primary/50 pr-4">
                  <span className="text-text-tertiary">Freeze Time:</span>
                  <span className="font-bold text-text-primary">15:25 IST</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-text-tertiary">Latency:</span>
                  <span className="font-bold text-accent-green">{latency}ms</span>
                </div>
              </div>
            </div>
          )}

          {/* Results Table */}
          <div className="overflow-x-auto border border-border-primary rounded bg-bg-secondary/20">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 font-mono">
                <div className="h-8 w-8 rounded-full border-2 border-accent-blue border-t-transparent animate-spin mb-4" />
                <span className="text-xs text-text-secondary animate-pulse">Running quantitative analysis...</span>
              </div>
            ) : results.length === 0 ? (
              showWatchlistOnly ? (
                <div className="flex flex-col items-center justify-center py-24 text-center font-mono select-none">
                  <Star size={48} className="text-accent-amber/40 mb-3 animate-pulse" />
                  <p className="text-xs text-text-primary font-bold">Watchlist Empty</p>
                  <p className="text-[9px] text-text-secondary mt-1 max-w-[280px]">
                    No starred stocks in your selection. Click the ★ icon next to any ticker to monitor it here.
                  </p>
                </div>
              ) : scannerMode === 'BTST' ? <BtstEmptyState /> : (
                <div className="flex flex-col items-center justify-center py-24 text-center font-mono select-none">
                  <Radar size={48} className="text-accent-blue/40 mb-3 animate-spin duration-3000" />
                  <p className="text-xs text-text-primary font-bold">Scanner Empty</p>
                  <p className="text-[9px] text-text-secondary mt-1 max-w-[280px]">
                    No stocks currently match the filter pipeline. Adjust price, score, or signal criteria.
                  </p>
                </div>
              )
            ) : (
              <table className="w-full text-left border-collapse font-mono text-xs select-none">
                <thead>
                  <tr className="border-b border-border-primary bg-bg-secondary text-text-secondary text-[10px] uppercase">
                    {visibleColumns.includes('checkbox') && <th className="p-2.5 w-8"></th>}
                    {visibleColumns.includes('watchlist') && <th className="p-2.5 w-10"></th>}
                    {visibleColumns.includes('symbol') && (
                      <th className="p-2.5 cursor-pointer hover:text-text-primary" onClick={() => handleSort('symbol')}>
                        <div className="flex items-center gap-1">Symbol <ArrowUpDown size={11} /></div>
                      </th>
                    )}
                    {visibleColumns.includes('signalTime') && <th className="p-2.5">Signal Time</th>}
                    {visibleColumns.includes('gap') && <th className="p-2.5">Gap %</th>}
                    {visibleColumns.includes('move') && <th className="p-2.5">Move %</th>}
                    {visibleColumns.includes('confidence') && <th className="p-2.5">Confidence</th>}
                    {visibleColumns.includes('exit') && <th className="p-2.5">Exit Strategy / Status</th>}
                    {visibleColumns.includes('ltp') && (
                      <th className="p-2.5 cursor-pointer hover:text-text-primary" onClick={() => handleSort('ltp')}>
                        <div className="flex items-center gap-1">LTP & Price <ArrowUpDown size={11} /></div>
                      </th>
                    )}
                    {visibleColumns.includes('distance') && <th className="p-2.5 max-md:hidden">Dist TC/BC %</th>}
                    {visibleColumns.includes('width') && <th className="p-2.5 max-md:hidden">CPR Width %</th>}
                    {visibleColumns.includes('setup') && <th className="p-2.5">Trade Setup (V3)</th>}
                    {visibleColumns.includes('rr') && <th className="p-2.5 max-md:hidden">RR</th>}
                    {visibleColumns.includes('signals') && <th className="p-2.5">Signals</th>}
                    {visibleColumns.includes('score') && (
                      <th className="p-2.5 cursor-pointer hover:text-text-primary w-28" onClick={() => handleSort('score')}>
                        <div className="flex items-center gap-1">Score & Conf <ArrowUpDown size={11} /></div>
                      </th>
                    )}
                    <th className="p-2.5 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary/50">
                  {results.map((row) => {
                    const isStarred = watchlist[row.symbol]?.starred;
                    const isPinned = watchlist[row.symbol]?.pinned;
                    const isNotified = watchlist[row.symbol]?.notify;
                    const isSelected = compareSymbols.includes(row.symbol);
                    const cellPadding = densityMode === 'compact' ? 'p-1.5' : 'p-3';

                    return (
                      <StockRow
                        key={row.id}
                        row={row}
                        densityMode={densityMode}
                        cellPadding={cellPadding}
                        visibleColumns={visibleColumns}
                        isSelected={isSelected}
                        isStarred={isStarred}
                        isPinned={isPinned}
                        isNotified={isNotified}
                        onToggleCompare={handleToggleCompareCheckbox}
                        onToggleWatchlist={handleToggleWatchlistState}
                        onOpenDrawer={handleOpenDrawer}
                        onChartRedirect={(r) => {
                          const cprRecord = {
                            id: r.id,
                            high: r.price * 1.015,
                            low: r.price * 0.985,
                            close: r.ltp,
                            pivot: r.pivot,
                            bc: r.bc,
                            tc: r.tc,
                            r1: r.r1,
                            r2: r.r2,
                            r3: r.r3,
                            r4: r.r4,
                            s1: r.s1,
                            s2: r.s2,
                            s3: r.s3,
                            s4: r.s4,
                            width: r.width,
                            classification: r.classification,
                            trend: r.score >= 50 ? 'Bullish' : 'Bearish',
                            createdAt: new Date().toISOString(),
                            ltp: r.ltp
                          };
                          sessionStorage.setItem('cpr_last_calculation', JSON.stringify(cprRecord));
                          sessionStorage.setItem('cpr_last_saved', 'false');
                          router.push('/calculate');
                        }}
                      />
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between font-mono text-[11px] text-text-secondary pt-3 border-t border-border-primary">
              <div>
                Showing Page <span className="font-bold text-text-primary">{page}</span> of{' '}
                <span className="font-bold text-text-primary">{totalPages}</span> ({total} stocks found)
              </div>
              <div className="flex items-center gap-1">
                <Button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  size="sm"
                  variant="secondary"
                  className="px-2 py-1"
                >
                  <ChevronLeft size={13} /> Prev
                </Button>
                <Button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  size="sm"
                  variant="secondary"
                  className="px-2 py-1"
                >
                  Next <ChevronRight size={13} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Checkbox Compare Floating Action Banner */}
      {compareSymbols.length > 0 && (
        <div className="fixed bottom-5 left-1/2 transform -translate-x-1/2 bg-bg-secondary border border-accent-blue rounded-full px-5 py-3 shadow-[0_4px_25px_rgba(59,130,246,0.3)] flex items-center gap-4 z-40 font-mono text-xs animate-fade-in">
          <span className="text-text-primary font-semibold">
            Basket: <span className="text-accent-blue font-bold">{compareSymbols.length}</span> / 5 Stocks
          </span>
          <div className="flex items-center gap-2">
            <Button
              onClick={executeCompareRedirect}
              size="sm"
              variant="primary"
              className="rounded-full px-4 text-xs h-8"
            >
              Compare Basket
            </Button>
            <button
              onClick={() => setCompareSymbols([])}
              className="p-1 hover:bg-bg-tertiary rounded-full text-text-secondary hover:text-text-primary"
              title="Clear Selection"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* QUICK ANALYZE SIDE DRAWER / MOBILE SHEET */}
      {drawerOpen && drawerStock && (
        <div className="fixed inset-0 z-50 overflow-hidden font-mono select-none">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setDrawerOpen(false)}
          />

          <div className="absolute inset-y-0 right-0 max-w-full flex max-sm:bottom-0 max-sm:top-auto max-sm:h-[85vh] max-sm:w-full">
            {/* Slide in panel: desktop 520px side drawer, mobile bottom sheet sliding */}
            <div className="w-screen sm:max-w-[520px] bg-bg-secondary border-l border-border-primary shadow-2xl flex flex-col justify-between h-full max-sm:rounded-t-xl overflow-hidden transition-transform transform translate-x-0 animate-slide-in">
              
              {/* Drawer Header */}
              <div className="p-4 border-b border-border-primary flex items-center justify-between bg-bg-primary">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-accent-blue font-bold uppercase tracking-wider flex items-center gap-1">
                    <Target size={12} />
                    Inspect Module V3
                  </span>
                  <h3 className="text-sm font-bold text-text-primary uppercase flex items-center gap-1.5">
                    {drawerStock.symbol} Details
                    {watchlist[drawerStock.symbol]?.starred && <Star size={11} fill="currentColor" className="text-accent-amber" />}
                  </h3>
                </div>
                <button 
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 hover:bg-bg-tertiary rounded text-text-secondary hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>

              {/* V3 multi-tab header */}
              <div className="flex border-b border-border-primary bg-bg-primary/50 text-[10px] uppercase font-bold overflow-x-auto">
                {(['overview', 'signals', 'tradeSetup', 'history', 'compare', 'notes'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setDrawerTab(tab)}
                    className={`px-4 py-2 border-b-2 whitespace-nowrap transition-all ${
                      drawerTab === tab 
                        ? 'border-accent-blue text-text-primary bg-bg-secondary/40' 
                        : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/20'
                    }`}
                  >
                    {tab === 'tradeSetup' ? 'Trade Setup' : tab}
                  </button>
                ))}
              </div>

              {/* Drawer Body Scroll */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {drawerTab === 'overview' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="bg-bg-primary/40 border border-border-primary/80 rounded p-4 space-y-3.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-base font-bold text-text-primary">{drawerStock.symbol}</h4>
                          <p className="text-[10px] text-text-tertiary mt-0.5">{drawerStock.sector} | {drawerStock.market}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-text-primary block">₹{fmt(drawerStock.ltp)}</span>
                          <span className="text-[10px] text-text-secondary mt-0.5">Mcap: ₹{drawerStock.marketCap.toLocaleString('en-IN')} Cr</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between border-t border-border-primary/50 pt-3 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-text-secondary">Scoring Rank:</span>
                          <span className="font-bold text-text-primary">{drawerStock.score} / 100</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold ${getConfidenceStyle(drawerStock.confidence)}`}>Conf {drawerStock.confidence}%</span>
                          {getRatingBadge(drawerStock.score)}
                        </div>
                      </div>
                    </div>

                    <div className="border border-border-primary rounded p-3 text-[11px] leading-relaxed text-text-secondary space-y-2">
                      <span className="font-bold text-text-primary block">CPR Property Classification</span>
                      <p>
                        {drawerStock.symbol} exhibits a <strong className="text-text-primary">{drawerStock.classification}</strong> Central Pivot Range (CPR) structure today. 
                        {drawerStock.classification === 'NARROW' 
                          ? ' A narrow CPR indicates contraction in volatility. Expect high-momentum breakouts or directional trend extension.'
                          : drawerStock.classification === 'WIDE'
                          ? ' A wide CPR suggests volatility expansion. High probability of rangebound mean-reversion sessions fading pivots.'
                          : ' A normal CPR is typically neutral, showing normal continuation setups.'}
                      </p>
                    </div>

                    {scannerMode === 'BTST' && (
                      <div className="border border-border-primary rounded p-3 text-[11px] leading-relaxed text-text-secondary space-y-2 mt-4">
                        <span className="font-bold text-accent-purple flex items-center gap-1 uppercase">
                          <Target size={12} /> BTST Score Explainability
                        </span>
                        
                        <div className="grid grid-cols-2 gap-2 mt-2 border-t border-border-primary/50 pt-2">
                          <div className="flex justify-between border-b border-border-primary/30 pb-1">
                            <span className="text-text-tertiary">VDU</span>
                            <span className="font-mono text-text-primary">{drawerStock.scoreBreakdown?.vdu ?? '—'}</span>
                          </div>
                          <div className="flex justify-between border-b border-border-primary/30 pb-1">
                            <span className="text-text-tertiary">CPR Narrow</span>
                            <span className="font-mono text-text-primary">{drawerStock.scoreBreakdown?.cprNarrow ?? '—'}</span>
                          </div>
                          <div className="flex justify-between border-b border-border-primary/30 pb-1">
                            <span className="text-text-tertiary">Higher Value</span>
                            <span className="font-mono text-text-primary">{drawerStock.scoreBreakdown?.higherValue ?? '—'}</span>
                          </div>
                          <div className="flex justify-between border-b border-border-primary/30 pb-1">
                            <span className="text-text-tertiary">VWAP</span>
                            <span className="font-mono text-text-primary">{drawerStock.scoreBreakdown?.vwap ?? '—'}</span>
                          </div>
                          <div className="flex justify-between border-b border-border-primary/30 pb-1">
                            <span className="text-text-tertiary">15m Confirmation</span>
                            <span className="font-mono text-text-primary">{drawerStock.scoreBreakdown?.conf15m ?? '—'}</span>
                          </div>
                          <div className="flex justify-between border-b border-border-primary/30 pb-1">
                            <span className="text-text-tertiary">Closing Strength</span>
                            <span className="font-mono text-text-primary">{drawerStock.scoreBreakdown?.closeStrength ?? '—'}</span>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center mt-2 bg-bg-primary/50 p-2 rounded border border-border-primary">
                          <span className="font-bold text-text-primary uppercase tracking-wider">Total Score</span>
                          <span className="font-bold text-accent-purple text-sm">{drawerStock.score}</span>
                        </div>

                        {drawerStock.rejectionReason && (
                          <div className="mt-3 p-2 border border-accent-red/30 bg-accent-red/10 rounded flex items-start gap-2">
                            <AlertTriangle size={14} className="text-accent-red shrink-0 mt-0.5" />
                            <div>
                              <span className="block font-bold text-accent-red uppercase tracking-wide mb-1">Rejection Reason</span>
                              <span className="text-accent-red/90">{drawerStock.rejectionReason}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {drawerTab === 'signals' && (
                  <div className="space-y-3 animate-fade-in">
                    <span className="text-[9px] text-text-tertiary uppercase tracking-wider block">Active Signal Breakdown</span>
                    <div className="flex flex-wrap gap-1.5">
                      {drawerStock.signals.map(sig => (
                        <span
                          key={sig}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getRatingColorClass(
                            sig === 'BREAKOUT' || sig === 'BULLISH' || sig === 'NARROW' ? 95 :
                            sig === 'BEARISH' || sig === 'WIDE' ? 10 : 50
                          )}`}
                        >
                          {sig}
                        </span>
                      ))}
                    </div>

                    <div className="border border-border-primary rounded p-3 text-[10px] space-y-2 text-text-secondary mt-2">
                      <span className="font-bold text-text-primary block uppercase">Signal Meaning</span>
                      <ul className="list-disc pl-4 space-y-1.5 leading-relaxed">
                        {drawerStock.signals.includes('BREAKOUT') && <li><strong>Breakout:</strong> Heavy volume spike coinciding with a price break above TC. Extremely strong bullish indicator.</li>}
                        {drawerStock.signals.includes('NARROW') && <li><strong>Narrow CPR:</strong> Width is under 0.3%, indicating major consolidation and imminent breakout.</li>}
                        {drawerStock.signals.includes('BULLISH') && <li><strong>Bullish Bias:</strong> LTP is trading above yesterday&apos;s TC level.</li>}
                        {drawerStock.signals.includes('BEARISH') && <li><strong>Bearish Bias:</strong> LTP is trading below yesterday&apos;s BC level.</li>}
                        {drawerStock.signals.includes('INSIDE') && <li><strong>Inside CPR:</strong> Price is consolidating inside the BC-TC zone. Neutral range setup.</li>}
                        {drawerStock.signals.includes('VIRGIN') && <li><strong>Virgin CPR:</strong> Today&apos;s candle does not touch the CPR channel. High likelihood of strong test tomorrow.</li>}
                      </ul>
                    </div>
                  </div>
                )}

                {drawerTab === 'tradeSetup' && (
                  <div className="space-y-4 animate-fade-in">
                    {drawerStock.entry > 0 && (
                      <div className="bg-bg-primary/30 border border-border-primary rounded p-4 space-y-3">
                        <span className="font-semibold text-text-primary flex items-center gap-1.5 text-[11px] uppercase border-b border-border-primary pb-2">
                          <Sparkles size={13} className="text-accent-amber" />
                          Algorithmic Trade Strategy
                        </span>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-text-tertiary text-[10px] block uppercase">Entry Threshold</span>
                            <span className="font-bold text-text-primary text-sm">₹{fmt(drawerStock.entry)}</span>
                          </div>
                          <div>
                            <span className="text-text-tertiary text-[10px] block uppercase">Target Objective</span>
                            <span className="font-bold text-accent-green text-sm">₹{fmt(drawerStock.target)}</span>
                          </div>
                          <div>
                            <span className="text-text-tertiary text-[10px] block uppercase">Stop Loss</span>
                            <span className="font-bold text-accent-red text-sm">₹{fmt(drawerStock.sl)}</span>
                          </div>
                          <div>
                            <span className="text-text-tertiary text-[10px] block uppercase">Risk Reward Ratio</span>
                            <span className="font-bold text-accent-blue text-sm">{drawerStock.rr}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="border border-border-primary rounded p-3 text-[10px] text-text-secondary leading-relaxed">
                      <span className="font-bold text-text-primary block uppercase mb-1">Trading Strategy Guide</span>
                      {drawerStock.score >= 70 ? (
                        <p className="text-accent-green bg-accent-green/5 p-2 rounded">
                          ★ <strong>Bullish Strategy:</strong> Consider buying near support or at the Entry threshold of ₹{fmt(drawerStock.entry)}. Hold for target objective ₹{fmt(drawerStock.target)}, and cut loss strictly if price sustains below stop loss ₹{fmt(drawerStock.sl)}.
                        </p>
                      ) : drawerStock.score < 20 ? (
                        <p className="text-accent-red bg-accent-red/5 p-2 rounded">
                          ▼ <strong>Bearish Strategy:</strong> Consider selling rallies near resistance or at the Entry boundary ₹{fmt(drawerStock.entry)}. Hold for target objective ₹{fmt(drawerStock.target)}, maintaining stop loss strictly at ₹{fmt(drawerStock.sl)}.
                        </p>
                      ) : (
                        <p className="text-accent-amber bg-accent-amber/5 p-2 rounded">
                          ⧉ <strong>Rangebound Strategy:</strong> Clustered consolidations favor fading range extremes. Buy near S1 and sell near R1. Avoid chasing breakout momentum unless volume spikes heavily.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1 mt-2">
                      <span className="text-[9px] text-text-tertiary uppercase tracking-wider block mb-1">CPR Band Level Chart</span>
                      <LevelChart record={{ ...drawerStock, trend: 'Trending' }} />
                    </div>
                  </div>
                )}

                {drawerTab === 'compare' && (
                  <div className="space-y-3 animate-fade-in">
                    <span className="text-[9px] text-text-tertiary uppercase tracking-wider block">
                      Sector Peer Group Comparison ({drawerStock.sector})
                    </span>
                    {results.filter(r => r.sector === drawerStock.sector && r.symbol !== drawerStock.symbol).length === 0 ? (
                      <div className="text-center py-5 text-text-tertiary text-xs">
                        No other stocks found in this sector.
                      </div>
                    ) : (
                      <div className="border border-border-primary rounded overflow-hidden">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-bg-primary/50 text-text-secondary uppercase border-b border-border-primary">
                              <th className="p-2">Peer Ticker</th>
                              <th className="p-2">LTP</th>
                              <th className="p-2">CPR Classification</th>
                              <th className="p-2 text-right">Score</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-primary/30">
                            {results
                              .filter(r => r.sector === drawerStock.sector && r.symbol !== drawerStock.symbol)
                              .slice(0, 5)
                              .map((peer) => (
                                <tr key={peer.symbol} className="hover:bg-bg-tertiary/10">
                                  <td className="p-2 font-bold text-text-primary">{peer.symbol}</td>
                                  <td className="p-2 text-text-secondary">₹{fmt(peer.ltp)}</td>
                                  <td className="p-2 text-text-secondary">{peer.classification}</td>
                                  <td className="p-2 text-right font-bold text-accent-blue">{peer.score}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {drawerTab === 'history' && (
                  <div className="space-y-2 animate-fade-in">
                    <span className="text-[9px] text-text-tertiary uppercase tracking-wider block">Historical Scans (Last 5 Sessions)</span>
                    {isDrawerHistoryLoading ? (
                      <div className="text-center py-5 text-text-secondary text-xs">Loading history...</div>
                    ) : drawerHistory.length === 0 ? (
                      <div className="text-center py-5 text-text-tertiary text-xs">No scan history recorded.</div>
                    ) : (
                      <div className="border border-border-primary rounded overflow-hidden">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-bg-primary/50 text-text-secondary uppercase border-b border-border-primary">
                              <th className="p-2">Date</th>
                              <th className="p-2">LTP</th>
                              <th className="p-2">CPR Width %</th>
                              <th className="p-2 text-right">Score</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-primary/30">
                            {drawerHistory.slice(0, 5).map((h, i) => (
                              <tr key={i} className="hover:bg-bg-tertiary/10">
                                <td className="p-2 text-text-secondary">{h.date}</td>
                                <td className="p-2 text-text-primary font-semibold">₹{fmt(h.ltp)}</td>
                                <td className="p-2 text-text-secondary">{h.width.toFixed(3)}%</td>
                                <td className="p-2 text-right font-bold text-accent-blue">{h.score}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {drawerTab === 'notes' && (
                  <div className="space-y-3 animate-fade-in">
                    <span className="text-[9px] text-text-tertiary uppercase tracking-wider block">Stock Notes (Local Persistence)</span>
                    <textarea
                      placeholder="Type your notes or analysis about this stock here (e.g. Breakout target raised, quarterly results positive)..."
                      value={stockNotes}
                      onChange={(e) => handleSaveNotes(e.target.value)}
                      className="w-full h-36 bg-bg-primary border border-border-secondary rounded p-3 text-text-primary text-xs focus:outline-none focus:border-accent-blue font-mono resize-none"
                    />
                    <div className="text-[9px] text-text-tertiary italic">
                      Notes are saved automatically in your browser localStorage.
                    </div>
                  </div>
                )}

              </div>

              {/* Drawer Footer Actions */}
              <div className="p-4 border-t border-border-primary bg-bg-primary flex items-center gap-2">
                <Button
                  onClick={() => {
                    const cprRecord = {
                      id: drawerStock.id,
                      high: drawerStock.price * 1.015,
                      low: drawerStock.price * 0.985,
                      close: drawerStock.ltp,
                      pivot: drawerStock.pivot,
                      bc: drawerStock.bc,
                      tc: drawerStock.tc,
                      r1: drawerStock.r1,
                      r2: drawerStock.r2,
                      r3: drawerStock.r3,
                      r4: drawerStock.r4,
                      s1: drawerStock.s1,
                      s2: drawerStock.s2,
                      s3: drawerStock.s3,
                      s4: drawerStock.s4,
                      width: drawerStock.width,
                      classification: drawerStock.classification,
                      trend: drawerStock.score >= 50 ? 'Bullish' : 'Bearish',
                      createdAt: new Date().toISOString(),
                      ltp: drawerStock.ltp
                    };
                    sessionStorage.setItem('cpr_last_calculation', JSON.stringify(cprRecord));
                    sessionStorage.setItem('cpr_last_saved', 'false');
                    router.push('/calculate');
                  }}
                  size="sm"
                  variant="primary"
                  className="flex-1 text-xs"
                >
                  Load in Calculator
                </Button>
                
                <Button
                  onClick={() => router.push(`/compare?symbols=${drawerStock.symbol}`)}
                  size="sm"
                  variant="secondary"
                  className="flex-1 text-xs"
                >
                  Compare stock
                </Button>

                <Button
                  onClick={() => setDrawerOpen(false)}
                  size="sm"
                  variant="ghost"
                  className="text-xs text-text-secondary"
                >
                  Close
                </Button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
