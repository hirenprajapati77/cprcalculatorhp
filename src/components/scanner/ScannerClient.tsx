'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
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
  LayoutGrid,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { LevelChart } from '@/components/chart/LevelChart';
import { fmt, formatIST } from '@/utils/format';

function getISTTimeParts(date: Date): { hour: number; minute: number; totalMinutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { hour, minute, totalMinutes: hour * 60 + minute };
}

function useBtstState() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { hour: hours, minute: minutes } = getISTTimeParts(now);
  const time = hours * 100 + minutes;

  let state = 'PREMARKET';
  let message = 'BTST discovery activates at 15:10 IST';
  let emptyMessage = 'BTST discovery has not started.';
  let nextRefresh = '';

  const istDateStr = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long'
  }).format(now);
  const isWeekend = istDateStr === 'Saturday' || istDateStr === 'Sunday';

  if (isWeekend) {
    state = 'MARKET_CLOSED';
    message = 'Market is closed';
    emptyMessage = 'No qualified BTST setups today.';
    nextRefresh = 'Locked';
  } else if (time < 915) {
    state = 'PREMARKET';
    message = 'BTST discovery activates at 15:10 IST';
    emptyMessage = 'BTST discovery has not started.';
    const diffMinutes = (15 * 60 + 10) - (hours * 60 + minutes);
    nextRefresh = `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m`;
  } else if (time >= 915 && time < 1510) {
    state = 'INTRADAY';
    message = 'BTST discovery activates at 15:10 IST';
    emptyMessage = 'BTST discovery has not started.';
    const diffMinutes = (15 * 60 + 10) - (hours * 60 + minutes);
    nextRefresh = `Opens in ${diffMinutes}m`;
  } else if (time >= 1510 && time < 1525) {
    state = 'ACTIVE';
    message = 'Generating BTST candidates';
    emptyMessage = 'Scanning live candidates…';
    nextRefresh = 'Live until 15:25';
  } else {
    state = 'FROZEN';
    message = 'Scan results frozen for today';
    emptyMessage = 'No qualified BTST setups today.';
    nextRefresh = 'Locked';
  }

  const timeStr = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(now);
  return { state, message, emptyMessage, nextRefresh, timeStr };
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
      case 'INTRADAY': return 'bg-bg-secondary text-text-secondary border-border-primary/50';
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
          {(state === 'ACTIVE' || state === 'INTRADAY') && <span className={`h-2 w-2 rounded-full ${state === 'ACTIVE' ? 'bg-accent-green animate-pulse' : 'bg-accent-blue'} `} />}
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
  direction?: 'LONG' | 'SHORT';
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
  signalSummary?: string;
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
    liquidity?: number;
    closeStrength?: number;
  };
  optionSuggestion?: {
    symbol?: string;
    strike?: number;
    type?: 'CE' | 'PE';
    ltp?: number;
    itmDepth?: number;
    momentumScore?: number;
    scoreBreakdown?: {
      oiScore: number;
      pcrContextScore: number;
      volumeScore: number;
      spreadScore: number;
      itmDepthScore: number;
    };
    pcr?: number;
    underlyingLtp?: number;
    formattedName?: string;
    lotSize?: number;
    cost?: number;
    oi?: number;
    volume?: number;
    sl?: number;
    target?: number;
    error?: string;
  } | null;
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
  'Other',
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
              {row.optionSuggestion && (
                <div className="mt-1.5 pt-1.5 border-t border-border-primary/30 flex flex-col gap-0.5">
                  {row.optionSuggestion.error ? (
                    <div className="text-rose-400 text-[8.5px] font-semibold leading-tight flex items-center gap-1">
                      <span>⚠️</span>
                      <span className="truncate max-w-[120px]" title={row.optionSuggestion.error}>
                        {row.optionSuggestion.error === 'TOKEN_EXPIRED' ? 'Fyers Disconnected' : 
                         row.optionSuggestion.error === 'EMPTY_CHAIN' ? 'No Option Chain' :
                         row.optionSuggestion.error === 'NO_ITM_STRIKES_AVAILABLE' ? 'No Budget Match' :
                         row.optionSuggestion.error === 'LOT_SIZE_UNAVAILABLE' ? 'No Lot Size' :
                         `Err: ${row.optionSuggestion.error}`}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center gap-1.5 text-[9px]">
                        <span className="font-bold text-accent-blue truncate max-w-[80px]" title={row.optionSuggestion.formattedName}>
                          {row.optionSuggestion.formattedName ? row.optionSuggestion.formattedName.split(' ').slice(1).join(' ') : '—'}
                        </span>
                        <span className="font-extrabold text-text-primary">₹{fmt(row.optionSuggestion.ltp || 0)}</span>
                      </div>
                      <div className={`text-[7.5px] font-bold leading-none ${
                        (row.optionSuggestion.momentumScore ?? 0) >= 70 ? 'text-accent-green' :
                        (row.optionSuggestion.momentumScore ?? 0) >= 40 ? 'text-accent-amber' : 'text-accent-red'
                      }`}>
                        Score: {row.optionSuggestion.momentumScore ?? 0}/100
                      </div>
                    </>
                  )}
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

            {visibleColumns.includes('direction') && (
        <td className={cellPadding}>
          {row.direction ? (
            <span className={`font-bold text-[10px] px-2 py-0.5 rounded ${row.direction === 'LONG' ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'}`}>
              {row.direction}
            </span>
          ) : (
            <span className="text-text-tertiary">—</span>
          )}
        </td>
      )}

      {visibleColumns.includes('score') && (
        <td className={cellPadding}>
          <div className="space-y-0.5 font-mono text-left">
            <div className="font-bold text-text-primary text-[13px] leading-none">{row.score}</div>
            <div className={`text-[10px] font-bold leading-none ${getConfidenceStyle(row.confidence)}`}>{row.confidence}%</div>
            {densityMode === 'detailed' && <div className="mt-1">{
              row.score >= 75 ? <Badge variant="purple" className="shadow-[0_0_10px_rgba(139,92,246,0.15)]">Strong Buy</Badge> :
              row.score >= 60 ? <Badge variant="green" className="shadow-[0_0_10px_rgba(16,185,129,0.15)]">Opportunity</Badge> :
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

  // Window enforcement & cache states
  const [executionWindowOpen, setExecutionWindowOpen] = useState<boolean>(true);
  const [cachedResult, setCachedResult] = useState<boolean>(false);
  const [scannedAt, setScannedAt] = useState<string>('');

  const isWeekend = useMemo(() => {
    return ['Saturday', 'Sunday'].includes(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long'
      }).format(new Date())
    );
  }, []);

  useEffect(() => {
    if (isWeekend) {
      setScannerMode('CPR');
    }
  }, [isWeekend]);

  // Filters & Pagination State
  const [universe, setUniverse] = useState<'NIFTY50' | 'NIFTY200' | 'NIFTY_FNO' | 'ALL'>('NIFTY_FNO');

  useEffect(() => {
    // 1. Default Universe
    const savedUniv = localStorage.getItem('cpr_settings_default_universe') || 'NSE_FNO';
    if (savedUniv === 'NSE_FNO') setUniverse('NIFTY_FNO');
    else if (savedUniv === 'NIFTY50') setUniverse('NIFTY50');
    else if (savedUniv === 'NIFTY200' || savedUniv === 'NIFTY100') setUniverse('NIFTY200');
    else if (savedUniv === 'ALL_NSE') setUniverse('ALL');

    // 2. Auto-Refresh Interval
    const savedRefresh = localStorage.getItem('cpr_settings_auto_refresh') || '15m';
    setRefreshInterval(savedRefresh);

    // 3. Min Price
    const savedMinPrice = localStorage.getItem('cpr_settings_min_price') || '20';
    setMinPrice(savedMinPrice);

    // Other Default Filters (Max Price, Scores, Width)
    const savedMaxPrice = localStorage.getItem('cpr_settings_max_price');
    if (savedMaxPrice) setMaxPrice(savedMaxPrice);

    const savedMinScore = localStorage.getItem('cpr_settings_min_score');
    if (savedMinScore) setMinScore(savedMinScore);

    const savedMaxScore = localStorage.getItem('cpr_settings_max_score');
    if (savedMaxScore) setMaxScore(savedMaxScore);

    const savedMinWidth = localStorage.getItem('cpr_settings_min_width');
    if (savedMinWidth) setMinWidth(savedMinWidth);

    const savedMaxWidth = localStorage.getItem('cpr_settings_max_width');
    if (savedMaxWidth) setMaxWidth(savedMaxWidth);
  }, []);
  const [market, setMarket] = useState<'NSE' | 'BSE'>('NSE');
  const [mode, setMode] = useState<string>('ALL');
  const [scannerMode, setScannerMode] = useState<'CPR' | 'BTST' | 'STBT' | 'OVERNIGHT'>('CPR');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(10);
  const [sortField, setSortField] = useState<string>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // V2/V3 Advanced Filters
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [marketCapCategory, setMarketCapCategory] = useState<string>('ALL');
  const [minPrice, setMinPrice] = useState<string>('20');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [minScore, setMinScore] = useState<string>('');
  const [maxScore, setMaxScore] = useState<string>('');
  const [minWidth, setMinWidth] = useState<string>('');
  const [maxWidth, setMaxWidth] = useState<string>('');

  // Table Configs: Density Mode & Column Visibility Show/Hide
  const [densityMode, setDensityMode] = useState<'compact' | 'detailed'>('detailed');
  const [showColumnSettings, setShowColumnSettings] = useState<boolean>(false);
  const [showFilters, setShowFilters] = useState<boolean>(true); // collapsed on mobile by default via CSS
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

  // Auto Refresh Logic
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const activeRequestRef = useRef<number>(0);
  // Auto Refresh Logic is moved down

  const [countdown, setCountdown] = useState<number>(0);

  // KPI Bar Stats
  const [latency, setLatency] = useState<number>(0);

  // Comparison Multi-Select
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);

  // Main Scanned Data
  const [results, setResults] = useState<ScannedStock[]>([]);
  const [topStocks, setTopStocks] = useState<ScannedStock[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [universeCount, setUniverseCount] = useState<number>(0);
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
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [drawerStock, setDrawerStock] = useState<ScannedStock | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'signals' | 'tradeSetup' | 'history' | 'compare' | 'notes' | 'cprStats'>('overview');
  const [drawerCprStats, setDrawerCprStats] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [drawerMtf, setDrawerMtf] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [isDrawerCprStatsLoading, setIsDrawerCprStatsLoading] = useState<boolean>(false);
  const [drawerHistory, setDrawerHistory] = useState<{
    date: string;
    score: number;
    tag?: string;
    signalSummary?: string;
    width?: number;
    cprWidth?: number;
  }[]>([]);
  const [isDrawerHistoryLoading, setIsDrawerHistoryLoading] = useState<boolean>(false);
  const [stockNotes, setStockNotes] = useState<string>('');
  const [compareStocks, setCompareStocks] = useState<ScannedStock[]>([]);
  const [isCompareLoading, setIsCompareLoading] = useState<boolean>(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [isNotesSaving, setIsNotesSaving] = useState<boolean>(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState<boolean>(false);

  const getTelemetryState = () => {
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    }).formatToParts(new Date());
    const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const t = h * 100 + m;
    
    if (t < 915) return { label: 'PREMARKET', color: 'bg-bg-secondary' };
    if (t >= 915 && t < 1510) return { label: 'INTRADAY', color: 'bg-accent-blue' };
    if (t >= 1510 && t < 1525) return { label: 'ACTIVE', color: 'bg-accent-green animate-pulse' };
    return { label: 'FROZEN', color: 'bg-accent-purple' };
  };
  const telState = getTelemetryState();

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
    { key: 'direction', label: 'Direction' },
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
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load Watchlist and Column configurations on mount
  useEffect(() => {
    fetch('/api/watchlist')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setWatchlist(data);
      })
      .catch(err => console.error('Failed to load watchlist:', err));

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
    if (scannerMode !== 'CPR') {
      setVisibleColumns(['checkbox', 'watchlist', 'symbol', 'ltp', 'setup', 'direction', 'signalTime', 'score', 'gap', 'move', 'confidence', 'exit']);
    } else {
      const savedColumns = localStorage.getItem('cpr_scanner_columns');
      if (savedColumns) {
        try {
          const parsed = JSON.parse(savedColumns);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setVisibleColumns(parsed);
          } else {
            setVisibleColumns(['checkbox', 'watchlist', 'symbol', 'ltp', 'distance', 'width', 'setup', 'rr', 'signals', 'score']);
          }
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
          body: JSON.stringify({
            symbol,
            starred: current.starred,
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
    const requestId = ++activeRequestRef.current;
    const startFetchTime = Date.now();
    try {
      if (scannerMode === 'BTST' || scannerMode === 'STBT' || scannerMode === 'OVERNIGHT') {
        const bypassVal = typeof window !== 'undefined' ? localStorage.getItem('cpr_settings_bypass_btst') === 'true' : false;
        // Live scoring engine — calls /api/btst which runs BtstService.evaluateOvernight on stocks in real-time
        const res = await fetch(`/api/btst?universe=${universe}${bypassVal ? '&bypass=true' : ''}`);
        if (!res.ok) throw new Error('Failed to retrieve live BTST/STBT signals');
        const data = await res.json();

        if (requestId !== activeRequestRef.current) return;

        setExecutionWindowOpen(data.executionWindowOpen ?? true);
        setCachedResult(data.cachedResult ?? false);
        setScannedAt(data.scannedAt || '');

        // Filter by direction based on scannerMode
        const allResults: Array<{
          symbol: string;
          ltp: number;
          longScore: number;
          shortScore: number;
          tag: 'LONG' | 'SHORT' | 'NEUTRAL_CONFLICT' | 'WEAK';
          signals: string[];
          entry: number;
          sl: number;
          target: number;
          rr: string;
          sector: string;
          marketCap: number;
          expectedGap: number;
          expectedMove: number;
          gapConfidence: number;
          exitStrategy: string;
          scoreBreakdown?: ScannedStock['scoreBreakdown'];
          optionSuggestion?: ScannedStock['optionSuggestion'];
        }> = data.results || [];

        const filtered = allResults.filter(r => {
          if (scannerMode === 'BTST') return r.tag === 'LONG';
          if (scannerMode === 'STBT') return r.tag === 'SHORT';
          return r.tag === 'LONG' || r.tag === 'SHORT' || r.tag === 'NEUTRAL_CONFLICT';
        });

        const mapped: ScannedStock[] = filtered.map((sig, idx) => {
          const base = {
            id: `btst-live-${idx}`,
            symbol: sig.symbol,
            date: new Date().toISOString().split('T')[0],
            market: 'NSE' as const,
            sector: sig.sector || 'NIFTY50',
            price: sig.ltp,
            open: sig.ltp,
            volume: 0,
            avgVolume: 0,
            marketCap: sig.marketCap || 0,
            ltp: sig.ltp,
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
            signals: sig.signals,
            score: Math.max(sig.longScore, sig.shortScore),
            confidence: sig.gapConfidence ?? Math.max(sig.longScore, sig.shortScore),
            entry: sig.entry,
            sl: sig.sl,
            target: sig.target,
            rr: sig.rr || '1:2.0',
            createdAt: new Date().toISOString(),
            signalTime: new Intl.DateTimeFormat('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            }).format(new Date()),
            expectedGap: sig.expectedGap ?? null,
            expectedMove: sig.expectedMove ?? null,
            exitStrategy: sig.exitStrategy || 'EOD',
            rejectionReason: null,
            volumeRatio: 1,
            ...(sig.scoreBreakdown !== undefined && { scoreBreakdown: sig.scoreBreakdown }),
            ...(sig.optionSuggestion !== undefined && { optionSuggestion: sig.optionSuggestion }),
          };
          // Only set direction when it is defined (exactOptionalPropertyTypes safe)
          if (sig.tag === 'LONG') return { ...base, direction: 'LONG' as const };
          if (sig.tag === 'SHORT') return { ...base, direction: 'SHORT' as const };
          return base as ScannedStock;
        });

        // Apply watchlist Pinned priority layout & dynamic column sorting client-side
        mapped.sort((a, b) => {
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
          } else if (sortField === 'gap') {
            comparison = (a.expectedGap ?? 0) - (b.expectedGap ?? 0);
          } else if (sortField === 'move') {
            comparison = (a.expectedMove ?? 0) - (b.expectedMove ?? 0);
          } else if (sortField === 'confidence') {
            comparison = (a.confidence ?? 0) - (b.confidence ?? 0);
          }
          
          return sortOrder === 'desc' ? -comparison : comparison;
        });

        // Update KPI insights
        if (data.insights) {
          setInsightCounts({
            strongBuy: data.insights.strongSignal || 0,
            breakoutReady: data.insights.breakoutReady || 0,
            avoid: data.insights.avoid || 0,
          });
        }

        setResults(mapped);
        setTotal(mapped.length);
        setTotalPages(1);
        setLatency(Date.now() - startFetchTime);
        setLastRefreshed(formatIST(new Date(), { timeOnly: true }));
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
      if (debouncedSearchQuery.trim()) {
        queryParams.set('search', debouncedSearchQuery.trim());
      }

      const res = await fetch(`/api/scanner?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Failed to retrieve scanning coordinates');

      const data = await res.json();
      if (data.success) {
        if (requestId !== activeRequestRef.current) return;

        setExecutionWindowOpen(true);
        setCachedResult(false);
        setScannedAt('');
        if (data.insights) {
          setInsightCounts(data.insights);
        }
        let items = data.results as ScannedStock[];

        // Client-side watchlist only filter
        if (showWatchlistOnly) {
          items = items.filter(r => watchlist[r.symbol]?.starred);
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
        setTotal(showWatchlistOnly ? items.length : data.total);
        setTotalPages(showWatchlistOnly ? Math.ceil(items.length / limit) : data.totalPages);
        if (data.universeCount) setUniverseCount(data.universeCount);
        setLatency(Date.now() - startFetchTime);
        setLastRefreshed(formatIST(new Date(), { timeOnly: true }));
      }
    } catch (err) {
      if (requestId === activeRequestRef.current) {
        showToast(err instanceof Error ? err.message : 'Scan query failed', 'error');
      }
    } finally {
      if (requestId === activeRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [page, limit, market, universe, mode, sortField, sortOrder, selectedSector, marketCapCategory, minPrice, maxPrice, minScore, maxScore, minWidth, maxWidth, showWatchlistOnly, watchlist, debouncedSearchQuery, showToast, scannerMode]);

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
        setLastRefreshed(formatIST(new Date(), { timeOnly: true }));
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

  const fetchBtstData = useCallback(async () => {
    await fetchScannerData(true);
  }, [fetchScannerData]);

  useEffect(() => {
    if (refreshInterval === 'Off') {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
      return;
    }
    const msMap: Record<string, number> = { '5m': 300000, '15m': 900000, '30m': 1800000 };
    const ms = msMap[refreshInterval] || 300000;
    
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    autoRefreshRef.current = setInterval(() => {
      fetchScannerData(true);
    }, ms);
    
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [refreshInterval, fetchScannerData]);

  const hasFetchedRef = useRef(false);

  useEffect(() => {
    const getISTMinutes = () => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(new Date());
      const h = parseInt(
        parts.find(p => p.type === 'hour')?.value || '0', 10
      );
      const m = parseInt(
        parts.find(p => p.type === 'minute')?.value || '0', 10
      );
      return { h, m, inWindow: h === 15 && m >= 20 && m <= 25 };
    };

    const checkAndRefresh = async () => {
      const { inWindow } = getISTMinutes();
      // Always fetch on mount to show cached or status
      // But only auto-refresh during window
      if (inWindow || !hasFetchedRef.current) {
        await fetchBtstData();
        hasFetchedRef.current = true;
      }
    };

    checkAndRefresh(); // run on mount
    const interval = setInterval(checkAndRefresh, 60000);
    return () => clearInterval(interval);
  }, [fetchBtstData]);

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
  const getTodayISTString = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const yyyy = parts.find(p => p.type === 'year')?.value || '2026';
    const mm = parts.find(p => p.type === 'month')?.value || '06';
    const dd = parts.find(p => p.type === 'day')?.value || '17';
    return `${yyyy}-${mm}-${dd}`;
  };

  // Open Quick Analyze Drawer & Load notes/history (history lazy-loaded on tab open)
  const handleOpenDrawer = async (stock: ScannedStock) => {
    setDrawerStock(stock);
    setDrawerOpen(true);
    setDrawerTab('overview');
    
    // Clear old tab data
    setDrawerHistory([]);
    setDrawerCprStats(null);
    setDrawerMtf(null);
    setCompareStocks([]);
    setCompareError(null);
  };

  // Save stock user notes state
  const handleSaveNotes = (val: string) => {
    setStockNotes(val);
  };

  const handleClearNote = () => {
    setStockNotes('');
    if (drawerStock) {
      const dateStr = getTodayISTString();
      const key = `cpr_notes_${drawerStock.symbol}_${dateStr}`;
      localStorage.removeItem(key);
      setShowSavedIndicator(true);
      setTimeout(() => setShowSavedIndicator(false), 2000);
    }
  };

  // Lazy load history, compare and notes on tab open
  useEffect(() => {
    if (!drawerStock || !drawerOpen) return;

    if (drawerTab === 'history') {
      setIsDrawerHistoryLoading(true);
      fetch(`/api/scanner/history?symbol=${drawerStock.symbol}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load history');
          return res.json();
        })
        .then(data => {
          setDrawerHistory(data.history || []);
        })
        .catch(err => {
          console.error('Failed to load drawer history:', err);
          setDrawerHistory([]);
        })
        .finally(() => {
          setIsDrawerHistoryLoading(false);
        });
    }

    if (drawerTab === 'compare') {
      setIsCompareLoading(true);
      setCompareError(null);
      fetch('/api/scanner/top?limit=5')
        .then(res => {
          if (!res.ok) throw new Error('Compare data unavailable.');
          return res.json();
        })
        .then(data => {
          setCompareStocks(data.results || []);
        })
        .catch(err => {
          console.error('Failed to load compare stocks:', err);
          setCompareError('Compare data unavailable.');
        })
        .finally(() => {
          setIsCompareLoading(false);
        });
    }

    if (drawerTab === 'cprStats') {
      setIsDrawerCprStatsLoading(true);
      fetch(`/api/cpr-stats?symbol=${drawerStock.symbol}&lookback=90`)
        .then(res => res.json())
        .then(data => setDrawerCprStats(data))
        .catch(err => console.error(err))
        .finally(() => setIsDrawerCprStatsLoading(false));
    }

    if (drawerTab === 'notes') {
      const dateStr = getTodayISTString();
      const key = `cpr_notes_${drawerStock.symbol}_${dateStr}`;
      const saved = localStorage.getItem(key) || '';
      setStockNotes(saved);
      setShowSavedIndicator(false);
      setIsNotesSaving(false);
    }
  }, [drawerTab, drawerStock, drawerOpen]);

  // Debounced auto-save notes to localStorage
  useEffect(() => {
    if (!drawerStock || drawerOpen === false || drawerTab !== 'notes') return;

    const dateStr = getTodayISTString();
    const key = `cpr_notes_${drawerStock.symbol}_${dateStr}`;
    const saved = localStorage.getItem(key) || '';

    if (stockNotes === saved) return;

    setIsNotesSaving(true);
    const timeout = setTimeout(() => {
      localStorage.setItem(key, stockNotes);
      setIsNotesSaving(false);
      setShowSavedIndicator(true);
      const hideIndicator = setTimeout(() => {
        setShowSavedIndicator(false);
      }, 2000);
      return () => clearTimeout(hideIndicator);
    }, 500);

    return () => clearTimeout(timeout);
  }, [stockNotes, drawerStock, drawerTab, drawerOpen]);
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
    showToast(`Loading scan run from ${formatIST(log.createdAt, { timeOnly: true })}`, 'info');
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
    if (score >= 75) return <Badge variant="purple" className="shadow-[0_0_10px_rgba(139,92,246,0.15)]">Strong Buy</Badge>;
    if (score >= 60) return <Badge variant="green" className="shadow-[0_0_10px_rgba(16,185,129,0.15)]">Opportunity</Badge>;
    if (score >= 40) return <Badge variant="amber" className="shadow-[0_0_10px_rgba(245,158,11,0.15)]">Watch</Badge>;
    if (score >= 20) return <Badge variant="gray">Ignore</Badge>;
    return <Badge variant="red" className="shadow-[0_0_10px_rgba(239,68,68,0.15)]">Avoid</Badge>;
  };

  // Standardized V3 color selectors
  const getRatingColorClass = (score: number) => {
    if (score >= 75) return 'text-accent-purple border-accent-purple/30 bg-accent-purple/10';
    if (score >= 60) return 'text-accent-green border-accent-green/30 bg-accent-green/10';
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
      const sec = SECTORS_LIST.includes(item.sector) ? item.sector : 'Other';
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

      if (score >= 75) checkAndAddCell('Strong Buy');
      if (score >= 60 && score < 75) checkAndAddCell('Breakout');
      if (
        signals.includes('BULLISH') ||
        signals.includes('ABOVE_VWAP') ||
        (scannerMode !== 'CPR' && signals.includes('HIGHER_VALUE'))
      ) checkAndAddCell('Bullish');
      if (
        signals.includes('BEARISH') ||
        signals.includes('BELOW_VWAP') ||
        (scannerMode !== 'CPR' && signals.includes('LOWER_VALUE'))
      ) checkAndAddCell('Bearish');
      if (score >= 40 && score < 60) checkAndAddCell('Watch');
    });

    return { grid, colTotals };
  }, [results, scannerMode]);

  // V2 Scanner Insights
  const strongBuyCount = results.filter(r => r.score >= 75 && !r.rejectionReason).length || insightCounts.strongBuy;
  const breakoutReadyCount = results.filter(r => r.score >= 60 && r.score < 75).length || insightCounts.breakoutReady;
  const watchlistCount = Object.keys(watchlist).filter(k => watchlist[k]?.starred).length;
  // @ts-expect-error btstStatus is optional and sometimes added by the backend
  const avoidCount = results.filter(r => r.score < 40 || r.btstStatus === 'NEUTRAL_CONFLICT').length || insightCounts.avoid;

  // KPI calculations
  const totalActiveSignals = useMemo(() => {
    return results.reduce((sum, item) => sum + item.signals.length, 0);
  }, [results]);

  const averageUniverseScore = useMemo(() => {
    if (results.length === 0) return 0;
    return results.reduce((sum, item) => sum + item.score, 0) / results.length;
  }, [results]);

  const btstMetrics = useMemo(() => {
    if (scannerMode === 'CPR' || results.length === 0) return { ready: 0, strong: 0, avgGap: 0, avgConf: 0 };
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

  // Countdown display calculation
  const getCountdownDisplay = () => {
    const partsForCountdown = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    const hForCountdown = parseInt(partsForCountdown.find(p => p.type === 'hour')?.value || '0', 10);
    const mForCountdown = parseInt(partsForCountdown.find(p => p.type === 'minute')?.value || '0', 10);

    const istDateStrForCountdown = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long'
    }).format(new Date());
    const isWeekdayForCountdown = istDateStrForCountdown !== 'Saturday' && istDateStrForCountdown !== 'Sunday';

    const totalMinForCountdown = hForCountdown * 60 + mForCountdown;
    const targetMinForCountdown = 15 * 60 + 10; // 15:10

    if (isWeekdayForCountdown && totalMinForCountdown < targetMinForCountdown) {
      const minutesUntil = targetMinForCountdown - totalMinForCountdown;
      return minutesUntil >= 60 
        ? `Opens in ${Math.floor(minutesUntil / 60)}h ${minutesUntil % 60}m`
        : `Opens in ${minutesUntil}m`;
    }
    return '';
  };
  const countdownDisplay = getCountdownDisplay();

  return (
    <div className="space-y-6 relative pb-20 terminal-grid">
      
      {scannerMode !== 'CPR' && <BtstStateBanner />}

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
                      {formatIST(log.createdAt, { includeTime: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* V3 Insights Cards */}
      {scannerMode !== 'CPR' ? (
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
              <span className="text-[10px] text-text-tertiary uppercase">Strong Signal</span>
              <p className="text-[9px] opacity-70">Score ≥ 75</p>
              <h2 className="text-2xl font-bold text-accent-purple">{strongBuyCount}</h2>
            </div>
            <div className="h-10 w-10 rounded bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center text-accent-purple">
              <Award size={18} />
            </div>
          </div>

          <div className="bg-bg-secondary/40 border border-border-primary p-4 rounded-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-text-tertiary uppercase">Breakout Ready</span>
              <p className="text-[9px] opacity-70">Score 60-74</p>
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
              <p className="text-[9px] opacity-70">Score &lt; 40 or Conflict</p>
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
                  <th className="p-2.5">Strong Buy (&gt;=75)</th>
                  <th className="p-2.5">Breakout (60-74)</th>
                  <th className="p-2.5">Bullish</th>
                  <th className="p-2.5">Bearish</th>
                  <th className="p-2.5">Watch (40-59)</th>
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
                        let chipColorClass = 'bg-slate-700 text-slate-300';
                        if (count > 0) {
                          textClass = 'text-text-primary font-bold';
                          if (sig === 'Strong Buy' || sig === 'Breakout') {
                            bgClass = count >= 3 ? 'bg-accent-purple/30' : 'bg-accent-purple/10';
                            chipColorClass = 'bg-violet-900/60 text-violet-200 border border-violet-500/30';
                          } else if (sig === 'Bullish') {
                            bgClass = count >= 3 ? 'bg-accent-green/30' : 'bg-accent-green/10';
                            chipColorClass = 'bg-emerald-900/60 text-emerald-200 border border-emerald-500/30';
                          } else if (sig === 'Bearish') {
                            bgClass = count >= 3 ? 'bg-accent-red/30' : 'bg-accent-red/10';
                            chipColorClass = 'bg-red-900/60 text-red-200 border border-red-500/30';
                          } else {
                            bgClass = count >= 3 ? 'bg-accent-amber/30' : 'bg-accent-amber/10';
                            chipColorClass = 'bg-amber-900/60 text-amber-200 border border-amber-500/30';
                          }
                        }

                        return (
                          <td
                            key={sig}
                            className={`border-l border-border-primary/30 transition-all ${bgClass} ${textClass}`}
                            style={{ verticalAlign: 'top', padding: 0, position: 'relative' }}
                          >
                            {count === 0 ? (
                              <div className="p-2.5 text-center text-text-tertiary">0</div>
                            ) : (
                              <div
                                className="group p-2 cursor-pointer"
                                style={{ minWidth: 90 }}
                              >
                                {/* Count badge */}
                                <div className="text-sm font-extrabold mb-1 text-center">{count}</div>
                                {/* Stock chips — show all, wrap */}
                                <div className="flex flex-wrap gap-0.5 justify-center">
                                  {cell.symbols.map((sym: string) => (
                                    <span
                                      key={sym}
                                      className={`inline-block px-1 py-0 rounded text-[7px] font-bold tracking-tight ${chipColorClass}`}
                                    >
                                      {sym}
                                    </span>
                                  ))}
                                </div>
                                {/* Hover tooltip showing avg score */}
                                <div
                                  className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block pointer-events-none"
                                  style={{ minWidth: 160 }}
                                >
                                  <div className="bg-slate-900 border border-slate-600 rounded-lg p-2.5 shadow-2xl text-left">
                                    <div className="text-[9px] text-slate-400 font-semibold uppercase mb-1">{sig} — {sectorName}</div>
                                    <div className="text-[9px] text-slate-300 mb-1.5">Avg Score: <span className="font-bold text-white">{cell.avgScore.toFixed(0)}</span> | Top: <span className="font-bold text-yellow-300">{cell.topStock || 'N/A'}</span></div>
                                    <div className="flex flex-wrap gap-0.5">
                                      {cell.symbols.map((sym: string) => (
                                        <span key={sym} className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold ${chipColorClass}`}>{sym}</span>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="w-2 h-2 bg-slate-900 border-b border-r border-slate-600 rotate-45 mx-auto -mt-1" />
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}
                      {/* Row Total */}
                      <td
                        className="p-2.5 border-l border-border-primary font-bold bg-bg-secondary/35 text-text-primary"
                      >
                        <div className="text-sm font-extrabold">{row.Total?.count || 0}</div>
                        {(row.Total?.count || 0) > 0 && (
                          <div className="text-[8px] text-text-secondary mt-0.5">
                            Avg: {row.Total?.avgScore?.toFixed(0) || 0}
                          </div>
                        )}
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
                        className="p-2.5 border-l border-border-primary/30"
                      >
                        <div className="text-sm font-extrabold">{colTotal.count}</div>
                        {colTotal.count > 0 && (
                          <div className="text-[8px] text-text-secondary mt-0.5">
                            Avg: {colTotal.avgScore.toFixed(0)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2.5 border-l border-border-primary text-accent-blue font-extrabold bg-bg-primary/30">
                    <div className="text-sm">{results.length}</div>
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
                onClick={() => {
                  if (scannerMode === 'CPR') setScannerMode('BTST');
                  else if (scannerMode === 'BTST') setScannerMode('STBT');
                  else if (scannerMode === 'STBT') setScannerMode('OVERNIGHT');
                  else setScannerMode('CPR');
                }}
                size="sm"
                variant="secondary"
                className={`text-[10px] h-7 font-bold ${scannerMode !== 'CPR' ? (scannerMode === 'BTST' ? 'bg-accent-green/20 text-accent-green border border-accent-green/50' : scannerMode === 'STBT' ? 'bg-accent-red/20 text-accent-red border border-accent-red/50' : 'bg-accent-blue/20 text-accent-blue border border-accent-blue/50') : ''}`}
              >
                Mode: {scannerMode}
              </Button>
            <Button
              onClick={() => setShowHelp(true)}
              size="sm"
              variant="ghost"
              className="text-[10px] h-7 px-2 text-text-tertiary hover:text-accent-blue"
              title="How this system works"
            >
              <Info size={14} />
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
          <div className="bg-bg-primary/50 border border-border-primary rounded font-mono text-xs">
            {/* Filter header — always visible, toggle on mobile */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
              onClick={() => setShowFilters(v => !v)}
            >
              <span className="font-semibold text-text-primary flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                <Activity size={13} className="text-accent-blue" />
                Filters
                {results.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-accent-blue/15 text-accent-blue text-[8px] font-bold border border-accent-blue/20">
                    {results.length} stocks
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {/* Quick active filter pills */}
                {universe !== 'NIFTY50' && <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-accent-amber/10 text-accent-amber text-[8px] border border-accent-amber/20">{universe}</span>}
                {selectedSector !== 'ALL' && <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple text-[8px] border border-accent-purple/20">{selectedSector}</span>}
                <ChevronRight
                  size={13}
                  className={`text-text-tertiary transition-transform duration-200 ${showFilters ? 'rotate-90' : ''}`}
                />
              </div>
            </div>

            {/* Collapsible filter body */}
            {showFilters && (
              <div className="px-4 pb-4 space-y-3 border-t border-border-primary/40">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-3">

                  {/* Universe */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-text-tertiary uppercase">Universe</span>
                    <select
                      value={universe}
                      onChange={(e) => handleFilterChange('universe', e.target.value)}
                      className="bg-bg-secondary border border-border-secondary text-text-primary px-2.5 py-1.5 rounded focus:outline-none focus:border-accent-blue cursor-pointer text-[11px]"
                    >
                      <option value="NIFTY50">Nifty 50 {universeCount > 0 && universe === 'NIFTY50' ? `(${universeCount})` : '(50)'}</option>
                      <option value="NIFTY200">Nifty 200</option>
                      <option value="NIFTY_FNO">NSE F&amp;O {universeCount > 0 && universe === 'NIFTY_FNO' ? `(${universeCount})` : '(182)'}</option>
                      <option value="ALL">All Stocks</option>
                    </select>
                  </div>

                  {/* Market */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-text-tertiary uppercase">Exchange</span>
                    <select
                      value={market}
                      onChange={(e) => handleFilterChange('market', e.target.value)}
                      className="bg-bg-secondary border border-border-secondary text-text-primary px-2.5 py-1.5 rounded focus:outline-none focus:border-accent-blue cursor-pointer text-[11px]"
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
                      className="bg-bg-secondary border border-border-secondary text-text-primary px-2.5 py-1.5 rounded focus:outline-none focus:border-accent-blue cursor-pointer text-[11px]"
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
                      className="bg-bg-secondary border border-border-secondary text-text-primary px-2.5 py-1.5 rounded focus:outline-none focus:border-accent-blue cursor-pointer text-[11px]"
                    >
                      <option value="ALL">All Sizes</option>
                      <option value="LARGE">Large Cap (&gt;20k Cr)</option>
                      <option value="MID">Mid Cap (5k-20k Cr)</option>
                      <option value="SMALL">Small Cap (&lt;5k Cr)</option>
                    </select>
                  </div>

                  {/* Search */}
                  <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-text-tertiary uppercase">Quick Search</span>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Symbol, Sector..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-bg-secondary border border-border-secondary text-text-primary pl-8 pr-3 py-1.5 rounded focus:outline-none focus:border-accent-blue w-full text-[11px]"
                      />
                      <Search size={12} className="absolute left-2.5 top-2.5 text-text-tertiary" />
                    </div>
                  </div>

                  {/* Price Range */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-text-tertiary uppercase">Price Min/Max</span>
                    <div className="flex items-center gap-1">
                      <input type="number" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
                        className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2 text-[11px]" />
                      <input type="number" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
                        className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2 text-[11px]" />
                    </div>
                  </div>

                  {/* Score Range */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-text-tertiary uppercase">Score Min/Max</span>
                    <div className="flex items-center gap-1">
                      <input type="number" placeholder="Min" value={minScore} onChange={(e) => setMinScore(e.target.value)}
                        className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2 text-[11px]" />
                      <input type="number" placeholder="Max" value={maxScore} onChange={(e) => setMaxScore(e.target.value)}
                        className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2 text-[11px]" />
                    </div>
                  </div>

                  {/* Width Range */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-text-tertiary uppercase">Width % Min/Max</span>
                    <div className="flex items-center gap-1">
                      <input type="number" step="0.01" placeholder="Min" value={minWidth} onChange={(e) => setMinWidth(e.target.value)}
                        className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2 text-[11px]" />
                      <input type="number" step="0.01" placeholder="Max" value={maxWidth} onChange={(e) => setMaxWidth(e.target.value)}
                        className="bg-bg-secondary border border-border-secondary text-text-primary px-2 py-1.5 rounded focus:outline-none focus:border-accent-blue w-1/2 text-[11px]" />
                    </div>
                  </div>

                  {/* Active Signal */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-text-tertiary uppercase">Active Signal</span>
                    <select value={mode} onChange={(e) => handleFilterChange('mode', e.target.value)}
                      className="bg-bg-secondary border border-border-secondary text-text-primary px-2.5 py-1.5 rounded focus:outline-none focus:border-accent-blue cursor-pointer text-[11px]">
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
                      <option value="INSIDE_VALUE">Inside Value</option>
                      <option value="HIGHER_VALUE">Higher Value</option>
                      <option value="LOWER_VALUE">Lower Value</option>
                      <option value="HOT_ZONE">Hot Zone</option>
                      <option value="KGS_INSIDE_CPR">KGS Inside CPR</option>
                      <option value="KGS_OUTSIDE_CPR">KGS Outside CPR</option>
                      <option value="KGS_ASC_CPR">KGS Ascending CPR</option>
                      <option value="KGS_DESC_CPR">KGS Descending CPR</option>
                      <option value="KGS_RTP">KGS RTP (Slope Match)</option>
                    </select>
                  </div>

                  {/* Starred Only */}
                  <div className="flex items-end gap-2">
                    <button
                      onClick={() => { setShowWatchlistOnly(!showWatchlistOnly); setPage(1); }}
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
            )}
          </div>

          {/* BTST Telemetry Panel */}
          {scannerMode !== 'CPR' && (
            <div className="bg-bg-primary/30 border border-border-primary rounded p-4 font-mono text-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-text-secondary">
                <Activity size={13} className="text-accent-blue" />
                Live Telemetry
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px]">
                <div className="flex items-center gap-1.5 border-r border-border-primary/50 pr-4">
                  <span className="text-text-tertiary">Discovery State:</span>
                  <div className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${telState.color}`} />
                    <span className="font-bold text-text-primary uppercase">
                      {telState.label}
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

          {/* Weekend Banner */}
          {isWeekend && (
            <div className="rounded-lg px-4 py-3 mb-4 flex items-center gap-3 bg-red-500/10 border border-red-500/30">
              <span className="text-lg">🛑</span>
              <p className="text-sm font-medium text-red-400 font-mono">
                {scannerMode === 'CPR'
                  ? 'Markets closed. See you Monday at 09:15 IST.'
                  : 'Markets closed. See you Monday at 15:20 IST.'}
              </p>
            </div>
          )}

          {/* Window Status Banner */}
          {scannerMode !== 'CPR' && !isWeekend && (
            <>
              {!executionWindowOpen && (
                <div className={`
                  rounded-lg px-4 py-3 mb-4 flex items-center gap-3 font-mono
                  ${cachedResult 
                    ? 'bg-amber-500/10 border border-amber-500/30' 
                    : 'bg-blue-500/10 border border-blue-500/30'}
                `}>
                  <span className="text-lg">
                    {cachedResult ? '🕐' : '⏳'}
                  </span>
                  <div>
                    <p className={`text-sm font-medium ${
                      cachedResult ? 'text-amber-400' : 'text-blue-400'
                    }`}>
                      {cachedResult
                        ? `Showing cached scan from ${scannedAt}`
                        : `BTST/STBT Scanner — Activates at 15:10 IST${countdownDisplay ? ` (${countdownDisplay})` : ''}`
                      }
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {cachedResult
                        ? 'Next live scan today at 15:10–15:25 IST'
                        : 'Results will appear here automatically when window opens'
                      }
                    </p>
                  </div>
                </div>
              )}

              {executionWindowOpen && (
                <div className="rounded-lg px-4 py-3 mb-4 flex 
                  items-center gap-3 bg-green-500/10 
                  border border-green-500/30 font-mono">
                  <span className="animate-pulse text-green-400">●</span>
                  <p className="text-sm font-medium text-green-400">
                    LIVE SCAN ACTIVE — 15:10 IST Window Open{countdownDisplay ? ' (Bypass/Testing Mode)' : ''}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Results Table & Pagination Container */}
          {(executionWindowOpen || cachedResult) && (
            <>
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
                  ) : scannerMode !== 'CPR' ? <BtstEmptyState /> : (
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
                        {visibleColumns.includes('direction') && <th className="p-2.5">Signal</th>}
                        {visibleColumns.includes('score') && (
                          <th className="p-2.5 cursor-pointer hover:text-text-primary w-28" onClick={() => handleSort('score')}>
                            <div className="flex items-center gap-1">Score & Freq <ArrowUpDown size={11} /></div>
                          </th>
                        )}
                        {visibleColumns.includes('signalTime') && <th className="p-2.5">Signal Time</th>}
                        {visibleColumns.includes('gap') && (
                          <th className="p-2.5 cursor-pointer hover:text-text-primary w-24" onClick={() => handleSort('gap')}>
                            <div className="flex items-center gap-1">Gap % <ArrowUpDown size={11} /></div>
                          </th>
                        )}
                        {visibleColumns.includes('move') && (
                          <th className="p-2.5 cursor-pointer hover:text-text-primary w-24" onClick={() => handleSort('move')}>
                            <div className="flex items-center gap-1">Move % <ArrowUpDown size={11} /></div>
                          </th>
                        )}
                        {visibleColumns.includes('confidence') && (
                          <th className="p-2.5 cursor-pointer hover:text-text-primary w-24" onClick={() => handleSort('confidence')}>
                            <div className="flex items-center gap-1">Gap Freq % <ArrowUpDown size={11} /></div>
                          </th>
                        )}
                        {visibleColumns.includes('exit') && <th className="p-2.5">Exit Strategy / Status</th>}
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
            </>
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
                {(['overview', 'signals', 'tradeSetup', 'history', 'compare', 'notes', 'cprStats'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setDrawerTab(tab)}
                    className={`px-4 py-2 border-b-2 whitespace-nowrap transition-all ${
                      drawerTab === tab 
                        ? 'border-accent-blue text-text-primary bg-bg-secondary/40' 
                        : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/20'
                    }`}
                  >
                    {tab === 'tradeSetup' ? 'Trade Setup' : tab === 'cprStats' ? 'CPR Stats' : tab}
                  </button>
                ))}
              </div>

              {/* Drawer Body Scroll */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                
                {drawerTab === 'overview' && (() => {
                  const activeSignals = drawerStock.signals || [];
                  const breakdown = drawerStock.scoreBreakdown || {
                    vdu: activeSignals.includes('VOLUME_SPIKE') ? 20 : 0,
                    cprNarrow: (activeSignals.includes('NARROW_CPR') || activeSignals.includes('VIRGIN_TODAY')) ? 15 : 0,
                    higherValue: (activeSignals.includes('HIGHER_VALUE') || activeSignals.includes('LOWER_VALUE')) ? 20 : 0,
                    vwap: (activeSignals.includes('ABOVE_VWAP') || activeSignals.includes('BELOW_VWAP')) ? 20 : 0,
                    liquidity: activeSignals.includes('LIQUID') ? 10 : 0,
                    closeStrength: (activeSignals.includes('CLOSING_STRENGTH') || activeSignals.includes('CLOSING_WEAKNESS')) ? 15 : 0,
                  };
                  return (
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
                             <span className={`text-[10px] font-bold ${getConfidenceStyle(drawerStock.confidence)}`}>Gap Freq {drawerStock.confidence}%</span>
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

                      {scannerMode !== 'CPR' && (
                        <div className="border border-border-primary rounded p-3 text-[11px] leading-relaxed text-text-secondary space-y-2 mt-4">
                          <span className="font-bold text-accent-purple flex items-center gap-1 uppercase">
                            <Target size={12} /> BTST Score Explainability
                          </span>
                          
                          <div className="grid grid-cols-2 gap-2 mt-2 border-t border-border-primary/50 pt-2">
                            <div className="flex justify-between border-b border-border-primary/30 pb-1">
                              <span className="text-text-tertiary">VDU</span>
                              <span className="font-mono text-text-primary">{breakdown.vdu ?? '—'}</span>
                            </div>
                            <div className="flex justify-between border-b border-border-primary/30 pb-1">
                              <span className="text-text-tertiary">CPR Narrow</span>
                              <span className="font-mono text-text-primary">{breakdown.cprNarrow ?? '—'}</span>
                            </div>
                            <div className="flex justify-between border-b border-border-primary/30 pb-1">
                              <span className="text-text-tertiary">Higher Value</span>
                              <span className="font-mono text-text-primary">{breakdown.higherValue ?? '—'}</span>
                            </div>
                            <div className="flex justify-between border-b border-border-primary/30 pb-1">
                              <span className="text-text-tertiary">VWAP</span>
                              <span className="font-mono text-text-primary">{breakdown.vwap ?? '—'}</span>
                            </div>
                            <div className="flex justify-between border-b border-border-primary/30 pb-1">
                              <span className="text-text-tertiary">Liquidity</span>
                              <span className="font-mono text-text-primary">{breakdown.liquidity ?? '—'}</span>
                            </div>
                            <div className="flex justify-between border-b border-border-primary/30 pb-1">
                              <span className="text-text-tertiary">Closing Strength</span>
                              <span className="font-mono text-text-primary">{breakdown.closeStrength ?? '—'}</span>
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
                  );
                })()}

                {drawerTab === 'signals' && (
                  <div className="space-y-3 animate-fade-in">
                    <span className="text-[9px] text-text-tertiary uppercase tracking-wider block">Active Signal Breakdown</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(drawerStock.signals || []).map(sig => (
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
                        {(drawerStock.signals || []).map(sig => {
                          const explMap: Record<string, string> = {
                            HIGHER_VALUE: "Today CPR is above yesterday's CPR. Bullish value migration.",
                            INSIDE_VALUE: "Today CPR overlaps yesterday. Consolidation, await breakout.",
                            LOWER_VALUE: "Today CPR below yesterday's CPR. Bearish value migration.",
                            BREAKOUT: "Heavy volume + price above TC. Strong bullish breakout.",
                            NARROW: "CPR width < 0.3%. High probability trending day ahead.",
                            VIRGIN: "CPR never tested. Strong magnet zone.",
                            HOT_ZONE: "Price within 0.5% of CPR band. High-reaction zone.",
                            VOLUME_SPIKE: "Volume > 2x average. Institutional activity.",
                            BULLISH: "Bias based on price vs yesterday TC/BC level.",
                            BEARISH: "Bias based on price vs yesterday TC/BC level.",
                            KGS_ASC_CPR: "3 consecutive days of rising CPR. Bullish trend expected. Long trades favored.",
                            KGS_DESC_CPR: "3 consecutive days of falling CPR. Bearish trend expected. Short trades favored.",
                            KGS_INSIDE_CPR: "Today's CPR fully inside yesterday's CPR band. Trending day expected.",
                            KGS_OUTSIDE_CPR: "Today's CPR wider than and contains yesterday's CPR. Sideways day expected — reduce conviction.",
                            KGS_RTP: "20 & 50 SMA sloping in the same direction. Running Trend Pattern confirmed — increases trending day probability when combined with Narrow CPR."
                          };
                          const expl = explMap[sig];
                          if (!expl) return null;
                          return (
                            <li key={sig}>
                              <strong>{sig}:</strong> {expl}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}

                {drawerTab === 'tradeSetup' && (() => {
                  const direction = drawerStock.direction || (drawerStock.score >= 50 ? 'LONG' : 'SHORT');
                  const calculatedEntry = direction === 'LONG' ? drawerStock.tc : drawerStock.bc;
                  
                  const calculatedSL = direction === 'LONG' 
                    ? drawerStock.bc 
                    : drawerStock.tc;
                  
                  const riskCalc = Math.abs(calculatedEntry - calculatedSL);
                  let calculatedTarget = 0;
                  if (direction === 'LONG') {
                    const rewardR1 = Math.abs((drawerStock.r1 || 0) - calculatedEntry);
                    calculatedTarget = (riskCalc > 0 && rewardR1 / riskCalc >= 1.5) ? (drawerStock.r1 || 0) : (drawerStock.r2 || 0);
                  } else {
                    const rewardS1 = Math.abs(calculatedEntry - (drawerStock.s1 || 0));
                    calculatedTarget = (riskCalc > 0 && rewardS1 / riskCalc >= 1.5) ? (drawerStock.s1 || 0) : (drawerStock.s2 || 0);
                  }
                  
                  const entry = drawerStock.entry || calculatedEntry;
                  const sl = drawerStock.sl || calculatedSL;
                  const target = drawerStock.target || calculatedTarget;
                  
                  let rr = drawerStock.rr;
                  if (!rr) {
                    const risk = Math.abs(entry - sl);
                    const reward = Math.abs(target - entry);
                    rr = risk > 0 ? `1:${(reward / risk).toFixed(1)}` : '1:2.0';
                  }

                  return (
                    <div className="space-y-4 animate-fade-in">
                      <div className="bg-bg-primary/30 border border-border-primary rounded p-4 space-y-3">
                        <span className="font-semibold text-text-primary flex items-center gap-1.5 text-[11px] uppercase border-b border-border-primary pb-2">
                          <Sparkles size={13} className="text-accent-amber" />
                          Algorithmic Trade Strategy
                        </span>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-text-tertiary text-[10px] block uppercase">Entry Threshold</span>
                            <span className="font-bold text-text-primary text-sm">₹{fmt(entry)}</span>
                          </div>
                          <div>
                            <span className="text-text-tertiary text-[10px] block uppercase">Target Objective</span>
                            <span className="font-bold text-accent-green text-sm">₹{fmt(target)}</span>
                          </div>
                          <div>
                            <span className="text-text-tertiary text-[10px] block uppercase">Stop Loss</span>
                            <span className="font-bold text-accent-red text-sm">₹{fmt(sl)}</span>
                          </div>
                          <div>
                            <span className="text-text-tertiary text-[10px] block uppercase">Risk Reward Ratio</span>
                            <span className="font-bold text-accent-blue text-sm">{rr}</span>
                          </div>
                        </div>
                      </div>

                      <div className="border border-border-primary rounded p-3 text-[10px] text-text-secondary leading-relaxed">
                        <span className="font-bold text-text-primary block uppercase mb-1">Trading Strategy Guide</span>
                        {direction === 'LONG' ? (
                          <p className="text-accent-green bg-accent-green/5 p-2 rounded">
                            ★ <strong>Bullish Strategy:</strong> Consider buying near TC at ₹{fmt(entry)}. Hold for ₹{fmt(target)}. Exit if below ₹{fmt(sl)}.
                          </p>
                        ) : (
                          <p className="text-accent-red bg-accent-red/5 p-2 rounded">
                            ▼ <strong>Bearish Strategy:</strong> Consider shorting near BC at ₹{fmt(entry)}. Cover at ₹{fmt(target)}. Exit if above ₹{fmt(sl)}.
                          </p>
                        )}
                      </div>

                      {drawerStock.optionSuggestion && (
                        <div className="bg-gradient-to-br from-accent-blue/15 to-accent-purple/15 border border-accent-blue/40 rounded p-4 space-y-2">
                          <span className="font-bold text-[9px] text-accent-blue uppercase tracking-wider block">Suggested Option Trade</span>
                          {drawerStock.optionSuggestion.error ? (
                            <div className="text-xs font-bold text-rose-400 p-1 flex items-center gap-1.5">
                              <span>⚠️</span>
                              <span>
                                {drawerStock.optionSuggestion.error === 'TOKEN_EXPIRED' ? 'Fyers token expired. Re-authenticate via Settings.' :
                                 drawerStock.optionSuggestion.error === 'EMPTY_CHAIN' ? 'No option chain data available for this symbol.' :
                                 drawerStock.optionSuggestion.error === 'NO_VIABLE_STRIKES' ? 'No viable ITM strike found (chain may lack OI/volume data).' :
                                 drawerStock.optionSuggestion.error === 'LOT_SIZE_UNAVAILABLE' ? 'Stock lot size is missing from symbol master.' :
                                 `Failed to fetch suggestion: ${drawerStock.optionSuggestion.error}`}
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {/* Strike info */}
                              <div className="flex justify-between items-center text-xs">
                                <div>
                                  <span className="text-sm font-extrabold text-text-primary block">{drawerStock.optionSuggestion.formattedName}</span>
                                  <span className="text-[10px] text-text-tertiary">Strike: ₹{drawerStock.optionSuggestion.strike} | Type: {drawerStock.optionSuggestion.type} | Lot: {drawerStock.optionSuggestion.lotSize} | Lot Value: ₹{fmt(drawerStock.optionSuggestion.cost || 0)}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-base font-extrabold text-accent-blue block">₹{fmt(drawerStock.optionSuggestion.ltp || 0)}</span>
                                  <span className="text-[9px] text-text-tertiary">ITM Depth: {drawerStock.optionSuggestion.itmDepth ?? '—'}</span>
                                </div>
                              </div>
                              {/* Momentum Score */}
                              {drawerStock.optionSuggestion.momentumScore !== undefined && (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-text-secondary">📊 Momentum Score</span>
                                    <span className={`text-sm font-extrabold ${
                                      (drawerStock.optionSuggestion.momentumScore ?? 0) >= 70 ? 'text-accent-green' :
                                      (drawerStock.optionSuggestion.momentumScore ?? 0) >= 40 ? 'text-accent-amber' : 'text-accent-red'
                                    }`}>{drawerStock.optionSuggestion.momentumScore}/100</span>
                                  </div>
                                  {/* Score breakdown */}
                                  {drawerStock.optionSuggestion.scoreBreakdown && (
                                    <div className="text-[9px] text-text-tertiary bg-bg-primary/40 rounded px-2 py-1 leading-relaxed">
                                      OI: <span className="text-text-secondary font-bold">{drawerStock.optionSuggestion.scoreBreakdown.oiScore}/30</span>
                                      {' | '}PCR Context: <span className="text-text-secondary font-bold">{drawerStock.optionSuggestion.scoreBreakdown.pcrContextScore}/20</span>
                                      {' | '}Volume: <span className="text-text-secondary font-bold">{drawerStock.optionSuggestion.scoreBreakdown.volumeScore}/20</span>
                                      {' | '}Spread: <span className="text-text-secondary font-bold">{drawerStock.optionSuggestion.scoreBreakdown.spreadScore}/20</span>
                                      {' | '}ITM Depth: <span className="text-text-secondary font-bold">{drawerStock.optionSuggestion.scoreBreakdown.itmDepthScore}/10</span>
                                    </div>
                                  )}
                                  {/* PCR context line */}
                                  {drawerStock.optionSuggestion.pcr !== undefined && (
                                    <div className="text-[9px] text-text-tertiary">
                                      Chain PCR: <span className="font-bold text-text-secondary">{drawerStock.optionSuggestion.pcr.toFixed(2)}</span>
                                      {' '}(<span className={`font-bold ${
                                        drawerStock.optionSuggestion.pcr > 1.2 ? 'text-accent-green' :
                                        drawerStock.optionSuggestion.pcr < 0.8 ? 'text-accent-red' : 'text-text-secondary'
                                      }`}>
                                        {drawerStock.optionSuggestion.pcr > 1.2 ? 'Bullish bias' : drawerStock.optionSuggestion.pcr < 0.8 ? 'Bearish bias' : 'Neutral'}
                                      </span>)
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* SL / Target */}
                              {(drawerStock.optionSuggestion.sl !== undefined || drawerStock.optionSuggestion.target !== undefined) && (
                                <div className="flex gap-3 text-[10px] border-t border-border-primary/30 pt-1.5">
                                  <span className="text-text-tertiary">SL: <span className="font-bold text-accent-red">₹{fmt(drawerStock.optionSuggestion.sl || 0)}</span></span>
                                  <span className="text-text-tertiary">Target: <span className="font-bold text-accent-green">₹{fmt(drawerStock.optionSuggestion.target || 0)}</span></span>
                                </div>
                              )}
                              {/* Disclaimer */}
                              <p className="text-[8px] text-text-tertiary italic leading-snug border-t border-border-primary/30 pt-1.5">
                                Momentum score uses same-day OI, volume, PCR &amp; spread. SL/Target are estimates based on 0.7 delta approximation. Verify live data before trading.
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-1 mt-2">
                        <span className="text-[9px] text-text-tertiary uppercase tracking-wider block mb-1">CPR Band Level Chart</span>
                        <LevelChart record={{ ...drawerStock, trend: 'Trending' }} />
                      </div>
                    </div>
                  );
                })()}

                {drawerTab === 'compare' && (
                  <div className="space-y-3 animate-fade-in">
                    <span className="text-[9px] text-text-tertiary uppercase tracking-wider block">
                      Top 5 Active Scanner Opportunities Comparison
                    </span>
                    {isCompareLoading ? (
                      <div className="text-center py-5 text-text-secondary text-xs">Loading comparison...</div>
                    ) : compareError ? (
                      <div className="text-center py-5 text-accent-red text-xs">{compareError}</div>
                    ) : compareStocks.length === 0 ? (
                      <div className="text-center py-5 text-text-tertiary text-xs">Compare data unavailable.</div>
                    ) : (
                      <div className="border border-border-primary rounded overflow-hidden">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-bg-primary/50 text-text-secondary uppercase border-b border-border-primary">
                              <th className="p-2">Symbol</th>
                              <th className="p-2">Score</th>
                              <th className="p-2">Width%</th>
                              <th className="p-2">Bias</th>
                              <th className="p-2 text-right">RR</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-primary/30">
                            {(() => {
                              const listToRender = [...compareStocks];
                              const hasCurrent = listToRender.some(s => s.symbol === drawerStock.symbol);
                              if (!hasCurrent) {
                                listToRender.unshift(drawerStock);
                              }
                              
                              return listToRender.slice(0, 6).map((stock) => {
                                const isCurrent = stock.symbol === drawerStock.symbol;
                                const direction = stock.direction || (stock.score >= 50 ? 'LONG' : 'SHORT');
                                const bias = direction === 'LONG' ? 'BULLISH' : 'BEARISH';
                                return (
                                  <tr 
                                    key={stock.symbol} 
                                    className={`hover:bg-bg-tertiary/10 transition-colors ${isCurrent ? 'bg-accent-blue/10 font-bold border-l-2 border-accent-blue' : ''}`}
                                  >
                                    <td className="p-2 text-text-primary uppercase flex items-center gap-1">
                                      {stock.symbol}
                                      {isCurrent && <span className="text-[8px] bg-accent-blue/20 text-accent-blue px-1 rounded uppercase">Current</span>}
                                    </td>
                                    <td className="p-2 text-text-secondary">{stock.score}</td>
                                    <td className="p-2 text-text-secondary">{(stock.width || 0).toFixed(3)}%</td>
                                    <td className={`p-2 font-bold ${bias === 'BULLISH' ? 'text-accent-green' : 'text-accent-red'}`}>{bias}</td>
                                    <td className="p-2 text-right text-text-secondary">{stock.rr || '1:2.0'}</td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {drawerTab === 'history' && (
                  <div className="space-y-2 animate-fade-in">
                    <span className="text-[9px] text-text-tertiary uppercase tracking-wider block">Historical Scans (Last 10 Sessions)</span>
                    {isDrawerHistoryLoading ? (
                      <div className="text-center py-5 text-text-secondary text-xs">Loading history...</div>
                    ) : drawerHistory.length === 0 ? (
                      <div className="text-center py-5 text-text-tertiary text-xs">No scan history yet for this symbol.</div>
                    ) : (
                      <div className="border border-border-primary rounded overflow-hidden">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-bg-primary/50 text-text-secondary uppercase border-b border-border-primary">
                              <th className="p-2">Date</th>
                              <th className="p-2">Score</th>
                              <th className="p-2">Tag</th>
                              <th className="p-2">Signals</th>
                              <th className="p-2 text-right">Width%</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-primary/30">
                            {drawerHistory.slice(0, 10).map((h, i) => (
                              <tr key={i} className="hover:bg-bg-tertiary/10">
                                <td className="p-2 text-text-secondary">{h.date}</td>
                                <td className="p-2 font-bold text-accent-blue">{h.score}</td>
                                <td className="p-2 text-text-primary uppercase">{h.tag || 'N/A'}</td>
                                <td className="p-2 text-text-secondary max-w-[200px] truncate" title={h.signalSummary || 'None'}>
                                  {h.signalSummary ? h.signalSummary.split(',').join(', ') : 'None'}
                                </td>
                                <td className="p-2 text-right text-text-secondary">{(h.width || h.cprWidth || 0).toFixed(3)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                
                {drawerTab === 'cprStats' && (
                  <div className="space-y-4 animate-fade-in">
                    <span className="text-[9px] text-text-tertiary uppercase tracking-wider block">CPR Width Historical Stats (90 Days)</span>
                    {isDrawerCprStatsLoading ? (
                      <div className="text-center py-5 text-text-secondary text-xs">Loading CPR stats...</div>
                    ) : !drawerCprStats ? (
                      <div className="text-center py-5 text-text-tertiary text-xs">Data unavailable.</div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-bg-primary/40 border border-border-primary/80 rounded p-3 text-center">
                          <div className="text-sm font-bold text-text-primary mb-1">
                            {drawerCprStats.currentClassification} CPR TODAY
                          </div>
                          <div className="text-xs text-text-secondary">
                            Width: <span className="text-accent-blue font-bold">{drawerCprStats.currentWidth.toFixed(3)}%</span>
                            <span className="mx-2">|</span>
                            Percentile: <span className="text-accent-blue font-bold">{drawerCprStats.historicalPercentile}</span> / 100
                          </div>
                          <div className="text-[10px] text-text-tertiary mt-2">
                            A NARROW CPR leads to a trending day <span className="text-accent-green font-bold">{drawerCprStats.narrowTrendRate.toFixed(1)}%</span> of the time for {drawerStock.symbol}.
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="h-40 border border-border-primary/50 bg-bg-primary/20 rounded p-2 flex flex-col">
                            <span className="text-[9px] text-center text-text-tertiary mb-2">CPR Type Distribution</span>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie 
                                  data={[
                                    { name: 'Narrow', value: drawerCprStats.narrowDays, color: '#3b82f6' },
                                    { name: 'Normal', value: drawerCprStats.normalDays, color: '#8b5cf6' },
                                    { name: 'Wide', value: drawerCprStats.wideDays, color: '#64748b' }
                                  ]}
                                  cx="50%" cy="50%" innerRadius={25} outerRadius={40} dataKey="value"
                                >
                                  {
                                    [
                                      { name: 'Narrow', value: drawerCprStats.narrowDays, color: '#3b82f6' },
                                      { name: 'Normal', value: drawerCprStats.normalDays, color: '#8b5cf6' },
                                      { name: 'Wide', value: drawerCprStats.wideDays, color: '#64748b' }
                                    ].map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)
                                  }
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 10, padding: 4 }} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          
                          <div className="h-40 border border-border-primary/50 bg-bg-primary/20 rounded p-2 flex flex-col">
                            <span className="text-[9px] text-center text-text-tertiary mb-2">Trend Rate by CPR Type</span>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={[
                                { name: 'Narrow', rate: drawerCprStats.narrowTrendRate },
                                { name: 'Normal', rate: drawerCprStats.normalTrendRate },
                                { name: 'Wide', rate: drawerCprStats.wideTrendRate }
                              ]}>
                                <XAxis dataKey="name" stroke="#888888" fontSize={9} tickLine={false} axisLine={false} />
                                <Tooltip contentStyle={{ backgroundColor: '#1a1b1e', borderColor: '#2d2e33', fontSize: 10, padding: 4 }} cursor={{ fill: '#ffffff10' }} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                                <Bar dataKey="rate" fill="#10b981" radius={[2, 2, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {drawerTab === 'notes' && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-text-tertiary uppercase tracking-wider block">Stock Notes (Local Persistence)</span>
                      <div className="flex items-center gap-2 font-mono">
                        {isNotesSaving && <span className="text-[10px] text-text-secondary">Saving...</span>}
                        {showSavedIndicator && <span className="text-[10px] text-accent-green font-bold">Saved ✓</span>}
                        <button
                          onClick={handleClearNote}
                          className="text-[10px] text-accent-red hover:underline font-bold uppercase transition-all"
                        >
                          Clear Note
                        </button>
                      </div>
                    </div>
                    <textarea
                      placeholder="Type your notes or analysis about this stock here (e.g. Breakout target raised, quarterly results positive)..."
                      value={stockNotes}
                      onChange={(e) => handleSaveNotes(e.target.value)}
                      className="w-full h-36 bg-bg-primary border border-border-secondary rounded p-3 text-text-primary text-xs focus:outline-none focus:border-accent-blue font-mono resize-none"
                    />
                    <div className="text-[9px] text-text-tertiary italic">
                      Notes are saved automatically in your browser localStorage with date-specific keys.
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


      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-primary/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-bg-secondary border border-border-primary rounded-xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border-primary/50 bg-bg-tertiary/50">
              <div className="flex items-center gap-2 text-accent-blue">
                <Info size={18} />
                <h3 className="font-bold text-sm">Overnight Engine System Guide</h3>
              </div>
              <button onClick={() => setShowHelp(false)} className="text-text-tertiary hover:text-text-primary">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[70vh] space-y-4 text-[13px] text-text-secondary leading-relaxed">
              <p>
                The Overnight Engine discovers high-probability trade setups designed to be held overnight. It operates on specific schedule rules and computes scores based on price relative to VWAP, Central Pivot Range (CPR) width, liquidity, and value relationship (Higher/Lower Value).
              </p>
              
              <div className="space-y-2">
                <h4 className="font-bold text-accent-blue">When to Take Trades?</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>BTST (Buy Today, Sell Tomorrow) / LONG:</strong> Look for stocks that show breakout momentum towards the end of the day. Take entry near 15:20 IST to avoid intraday volatility and capture the next day&apos;s gap-up open.</li>
                  <li><strong>STBT (Sell Today, Buy Tomorrow) / SHORT:</strong> Look for stocks breaking down with heavy selling pressure. Entry should similarly be taken near 15:20 IST aiming for a gap-down open.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-accent-blue">Understanding the Engine Modes</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>CPR Mode:</strong> Standard Intraday CPR Scanner.</li>
                  <li><strong className="text-accent-green">BTST Mode:</strong> Filters strictly for LONG setups. Shows gap-up predictions.</li>
                  <li><strong className="text-accent-red">STBT Mode:</strong> Filters strictly for SHORT setups. Shows gap-down predictions.</li>
                  <li><strong className="text-accent-purple">OVERNIGHT Mode:</strong> Combined view displaying both BTST and STBT opportunities, with conflict-resolution tagging applied if a stock qualifies for both.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-accent-blue">Scores and Confidence</h4>
                <p>
                  Scores out of 100 represent the alignment of indicators. 
                  A score <strong>≥ 75</strong> is considered a Strong Buy/Sell. 
                  Confidence percentage reflects the mathematical probability of a successful gap based on historical performance of the setup.
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-border-primary/50 flex justify-end">
              <Button onClick={() => setShowHelp(false)} variant="primary" size="sm" className="font-bold">Understood</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
