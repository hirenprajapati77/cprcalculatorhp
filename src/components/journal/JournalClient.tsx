'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Download, RefreshCw, ChevronLeft, ChevronRight,
  Activity, X, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import IndexBtstComparePanel from '@/components/journal/IndexBtstComparePanel';
import StockBtstComparePanel from '@/components/journal/StockBtstComparePanel';
import { VpaBreakdownPanel, type VpaBreakdownView } from '@/components/vpa/VpaBreakdownPanel';
import { StockDetailDrawer, type DrawerStockData } from '@/components/enterprise/StockDetailDrawer';
import { JournalKpiStrip } from '@/components/journal/JournalKpiStrip';
import { TradeDetailDrawer, type JournalTradeData } from '@/components/journal/TradeDetailDrawer';
import { JournalFilters, type JournalFiltersState } from '@/components/journal/JournalFilters';
import { JournalAnalyticsView } from '@/components/journal/JournalAnalyticsView';
import { BTST_CLOCK } from '@/lib/market-hours';

interface ColumnDef {
  key: string;
  label: string;
  required?: boolean;
}

const COLUMN_DEFS: ColumnDef[] = [
  { key: 'date', label: 'Trade Date' },
  { key: 'type', label: 'Signal Type' },
  { key: 'symbol', label: 'Symbol', required: true },
  { key: 'contract', label: 'Option Contract' },
  { key: 'entry', label: 'Entry CMP' },
  { key: 'cmp916', label: '9:16 AM' },
  { key: 'cmp930', label: '9:30 AM' },
  { key: 'cmp945', label: '9:45 AM' },
  { key: 'exit', label: 'Exit CMP' },
  { key: 'pnl', label: 'Gross P&L' },
  { key: 'netPnl', label: 'Estimated Net P&L' },
  { key: 'score', label: 'Model Score' },
  { key: 'scoreV2', label: 'Shadow V2' },
  { key: 'action', label: 'Action', required: true },
];

const DEFAULT_VISIBLE_COLUMNS = [
  'date',
  'type',
  'symbol',
  'contract',
  'entry',
  'cmp916',
  'cmp930',
  'cmp945',
  'exit',
  'pnl',
  'netPnl',
  'score',
  'scoreV2',
  'action',
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface JournalEntry {
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
  scoreV2?: number | null;
  v2Breakdown?: Record<string, unknown> | null;
  confidence: number;
  signalSummary: string;
  
  // Phase 3 Linkage
  executionOutcome?: string | null;
  qualityBucketAtSignal?: string | null;
  eventRiskReasonAtSignal?: string | null;
  eventRiskScoreAtSignal?: number | null;
  regimeSnapshotAtSignal?: string | null;
  slippageModelVersionAtSignal?: number | null;

  // P2 Model Friction (non-destructive)
  estimatedCharges?: number | null;
  estimatedNetPnl?: number | null;
  estimatedNetPnlPct?: number | null;
  frictionModelTier?: string | null;
}

interface JournalStats {
  totalTrades: number;
  totalClosedTrades?: number;
  totalAllTrades?: number;
  winners: number;
  winRate: number;
  avgPnlPct: number;
  bestSignalType: 'CPR' | 'BTST' | 'STBT';
  byType: {
    CPR:  { count: number; winRate: number };
    BTST: { count: number; winRate: number };
    STBT: { count: number; winRate: number };
  };
}

interface ReportingResponse {
  qualityBuckets: { groupValue: string; count: number; winRate: number; avgPnlPct: number; }[];
  regimes: { groupValue: string; count: number; winRate: number; avgPnlPct: number; }[];
  executionOutcomes: { groupValue: string; count: number; winRate: number; avgPnlPct: number; }[];
  eventRisks: { groupValue: string; count: number; winRate: number; avgPnlPct: number; }[];
  variance: { averageVariancePct: number; sampleSize: number; };
}

interface JournalResponse {
  success: boolean;
  entries: JournalEntry[];
  total: number;
  page: number;
  totalPages: number;
  stats: JournalStats;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIGNAL_COLORS: Record<string, string> = {
  CPR:  '#3b82f6',
  BTST: '#22c55e',
  STBT: '#ef4444',
};

const SIGNAL_BG: Record<string, string> = {
  CPR:  'rgba(59,130,246,0.12)',
  BTST: 'rgba(34,197,94,0.12)',
  STBT: 'rgba(239,68,68,0.12)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null, decimals = 2): string {
  if (n === null || n === undefined) return '---';
  return n.toFixed(decimals);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata',
  });
}

function pnlColor(v: number | null): string {
  if (v === null) return '#64748b';
  return v >= 0 ? '#22c55e' : '#ef4444';
}

// Compute avg P&L% at each snapshot time across all entries that have that snapshot
function computeAvgAtTime(
  entries: JournalEntry[],
  field: 'cmp916' | 'cmp930' | 'cmp945' | 'cmp1000'
): number {
  const valid = entries.filter(e => e[field] !== null && e.entryCmp > 0);
  if (valid.length === 0) return 0;
  const sum = valid.reduce((s, e) => {
    const cmp = e[field] as number;
    return s + ((cmp - e.entryCmp) / e.entryCmp) * 100;
  }, 0);
  return parseFloat((sum / valid.length).toFixed(2));
}

interface V2Breakdown {
  direction?: string;
  classification?: string;
  hardGates?: Record<string, boolean>;
  scoreBreakdown?: { clvScore?: number; cprScore?: number; liquidityScore?: number; [k: string]: number | undefined };
  rawMetrics?: { clv?: number; cprWidth?: number; liquidityPassed?: boolean | number; [k: string]: number | boolean | undefined };
  vpa?: VpaBreakdownView;
}

function V2DirectionPill({ direction }: { direction?: string | undefined }) {
  if (!direction) return <span className="text-slate-500">---</span>;
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    LONG:    { label: '🟢 LONG',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
    SHORT:   { label: '🔴 SHORT',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    NEUTRAL: { label: '🟡 NEUTRAL', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
  };
  const c = cfg[direction] ?? { label: direction, color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' };
  return (
    <span style={{ color: c.color, background: c.bg, border: `1px solid ${c.color}40` }}
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider">
      {c.label}
    </span>
  );
}

function V2CprClassBadge({ cls }: { cls?: string | undefined }) {
  if (!cls) return <span className="text-slate-500 text-[9px]">---</span>;
  const colors: Record<string, string> = { NARROW: '#22c55e', NORMAL: '#3b82f6', WIDE: '#f97316', VIRGIN: '#a855f7' };
  return <span style={{ color: colors[cls] ?? '#94a3b8' }} className="font-bold text-[9px] tracking-wider">{cls}</span>;
}

function V2FinalScore({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';
  return <span style={{ color }} className="font-mono font-bold text-sm">{score}</span>;
}

function renderV2Breakdown(
  breakdown: V2Breakdown | null | undefined,
  scoreV2: number | null | undefined,
  isExpanded: boolean,
  onToggleExpand: () => void,
): React.ReactNode {
  if (!breakdown || typeof breakdown !== 'object') {
    return (
      <div className="space-y-1 text-[10px] text-slate-500 italic">
        No breakdown data available.
        <div className="text-[9px] text-text-tertiary mt-1 not-italic">
          Simple V2 shadow scoring runs at journal creation for research only — it does not pick trades.
        </div>
      </div>
    );
  }

  const gates   = breakdown.hardGates ?? {};
  const scores  = breakdown.scoreBreakdown ?? {};
  const metrics = breakdown.rawMetrics ?? {};
  const allGatesPass = Object.values(gates).every(Boolean);
  const scoreBeforeGate = (scores.clvScore ?? 0) + (scores.cprScore ?? 0) + (scores.liquidityScore ?? 0);
  const finalScore = scoreV2 ?? 0;

  let rejectionReason = '';
  if (!allGatesPass) {
    const dir = breakdown.direction;
    if (dir === 'NEUTRAL') rejectionReason = 'BC & TC moved in opposite directions — split CPR, no valid trend direction';
    else rejectionReason = 'Higher/Lower Value gate failed — CPR did not confirm the required trend shift';
  }

  return (
    <div className="space-y-2 text-[10px]">

      {/* Info tooltip */}
      <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}
        className="rounded px-2 py-1.5 text-[9px] text-slate-400 leading-relaxed">
        <span className="text-blue-400 font-semibold">ⓘ</span>{' '}
        Research-only Simple V2 shadow (0–100). Raw = CLV + CPR + Liquidity; hard gate sets eligibility.
        If the gate fails, stored shadow score becomes <span className="text-red-400 font-semibold">0</span>.
        Trade decisions use the Advanced column.
      </div>

      {/* Direction */}
      <div className="flex items-center justify-between border-b border-border-primary pb-1.5">
        <span className="text-text-secondary font-medium">Direction</span>
        <V2DirectionPill direction={breakdown.direction} />
      </div>

      {/* Hard Gate */}
      <div style={{
          background: allGatesPass ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
          border: `1px solid ${allGatesPass ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }} className="rounded-md px-2 py-1.5 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-bold text-text-secondary uppercase tracking-wider">Hard Gate</span>
          <span style={{ color: allGatesPass ? '#22c55e' : '#ef4444' }} className="text-[9px] font-bold">
            {allGatesPass ? '🟢 PASSED' : '🔴 FAILED'}
          </span>
        </div>
        <div className="text-[9px] leading-snug" style={{ color: allGatesPass ? 'rgba(134,239,172,0.8)' : 'rgba(252,165,165,0.8)' }}>
          {allGatesPass ? 'Higher Value confirmed — CPR trend valid' : rejectionReason}
        </div>
      </div>

      {/* Raw Component Score */}
      <div className="border-b border-border-primary pb-1.5 space-y-0.5">
        <div className="text-[8px] font-bold text-text-secondary uppercase tracking-wider mb-1">Raw Component Score</div>
        <div className="pl-1 space-y-0.5">
          <div className="flex justify-between text-[9px]">
            <span className="text-slate-400">CLV Score</span>
            <span className="font-mono text-white font-semibold">+{scores.clvScore ?? 0}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span className="text-slate-400">CPR Score</span>
            <span className="font-mono text-white font-semibold">+{scores.cprScore ?? 0}</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span className="text-slate-400">Liquidity Score</span>
            <span className="font-mono text-white font-semibold">+{scores.liquidityScore ?? 0}</span>
          </div>
          <div className="flex justify-between text-[9px] pt-0.5 mt-0.5" style={{ borderTop: '1px dashed rgba(148,163,184,0.2)' }}>
            <span className="text-slate-400 font-semibold">Score Before Gate</span>
            <span className="font-mono text-white font-bold">{scoreBeforeGate}</span>
          </div>
        </div>
      </div>

      {/* Gate Result & Final */}
      <div className="border-b border-border-primary pb-1.5 pl-1 space-y-0.5">
        <div className="flex justify-between text-[9px]">
          <span className="text-slate-400">Gate Result</span>
          <span style={{ color: allGatesPass ? '#22c55e' : '#ef4444' }} className="font-bold">{allGatesPass ? 'PASSED' : 'FAILED'}</span>
        </div>
        <div className="flex justify-between text-[9px]">
          <span className="text-slate-400">Multiplier</span>
          <span className="font-mono font-bold text-white">×{allGatesPass ? '1' : '0'}</span>
        </div>
        <div className="flex justify-between text-[9px] items-center">
          <span className="text-slate-400 font-semibold">Stored Shadow Score</span>
          <V2FinalScore score={finalScore} />
        </div>
      </div>

      {breakdown.vpa?.enabled && (
        <VpaBreakdownPanel vpa={breakdown.vpa} compact className="mt-1" />
      )}

      {/* Expand toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
        className="w-full text-[9px] text-blue-400 hover:text-blue-300 font-semibold flex items-center justify-center gap-1 py-0.5 transition-colors"
      >
        {isExpanded ? '▲ Hide Details' : '▼ Show Details'}
      </button>

      {/* Expanded detail section */}
      {isExpanded && (
        <div className="space-y-1.5 pt-1 border-t border-border-primary">
          <div className="text-[8px] font-bold text-text-secondary uppercase tracking-wider mb-0.5">CPR Classification</div>
          <div className="flex justify-between text-[9px] pl-1">
            <span className="text-slate-400">Tomorrow&apos;s CPR</span>
            <V2CprClassBadge cls={breakdown.classification} />
          </div>

          <div className="text-[8px] font-bold text-text-secondary uppercase tracking-wider mt-1.5 mb-0.5">CLV Detail</div>
          <div className="pl-1 space-y-0.5">
            <div className="flex justify-between text-[9px]">
              <span className="text-slate-400">CLV Raw</span>
              <span className="font-mono text-slate-300">{typeof metrics.clv === 'number' ? metrics.clv.toFixed(4) : '---'}</span>
            </div>
            <div className="flex justify-between text-[9px]">
              <span className="text-slate-400">CPR Width %</span>
              <span className="font-mono text-slate-300">{typeof metrics.cprWidth === 'number' ? metrics.cprWidth.toFixed(3) + '%' : '---'}</span>
            </div>
            <div className="flex justify-between text-[9px]">
              <span className="text-slate-400">Liquidity Gate</span>
              <span style={{ color: metrics.liquidityPassed ? '#22c55e' : '#ef4444' }} className="font-bold">
                {metrics.liquidityPassed ? '✓ Passed' : '✗ Failed'}
              </span>
            </div>
          </div>

          {Object.keys(gates).length > 0 && (
            <>
              <div className="text-[8px] font-bold text-text-secondary uppercase tracking-wider mt-1.5 mb-0.5">Gate Detail</div>
              <div className="pl-1 space-y-0.5">
                {Object.entries(gates).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[9px]">
                    <span className="text-slate-400 capitalize">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                    <span style={{ color: v ? '#22c55e' : '#ef4444' }} className="font-bold">{v ? '✓ Passed' : '✗ Failed'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SignalBadge({ type, qualityBucket }: { type: string; qualityBucket?: string | null | undefined }) {
  return (
    <span
      title={qualityBucket ?? undefined}
      style={{
        color: SIGNAL_COLORS[type] ?? '#94a3b8',
        background: SIGNAL_BG[type] ?? 'rgba(148,163,184,0.1)',
        border: `1px solid ${SIGNAL_COLORS[type] ?? '#94a3b8'}40`,
      }}
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase whitespace-nowrap cursor-help"
    >
      {type}
    </span>
  );
}

function OutcomeDot({ outcome }: { outcome: string | null | undefined }) {
  if (!outcome) return null;
  let color = '#94a3b8';
  let tooltip = outcome.replace(/_/g, ' ');
  if (outcome === 'MODEL_VALID') {
    color = '#22c55e';
    tooltip = 'Model signal was correct and execution was profitable.';
  } else if (outcome === 'EXECUTION_SLIPPAGE' || outcome === 'MODEL_WEAK') {
    color = '#eab308';
    tooltip = outcome === 'EXECUTION_SLIPPAGE'
      ? 'Signal was TRADEABLE, but option execution lost money (possible slippage).'
      : 'Signal was WATCHLIST quality and resulted in a loss.';
  } else if (outcome === 'GAP_FAILURE' || outcome === 'EVENT_RISK_AVOIDABLE' || outcome === 'LOW_QUALITY_SHOULD_SKIP') {
    color = '#ef4444';
    if (outcome === 'GAP_FAILURE') tooltip = 'Extreme adverse overnight gap blow-through (>15%).';
    if (outcome === 'EVENT_RISK_AVOIDABLE') tooltip = 'Loss occurred during a known high-risk event.';
    if (outcome === 'LOW_QUALITY_SHOULD_SKIP') tooltip = 'Trade was forced on a LOW_QUALITY signal.';
  }
  return (
    <span
      title={tooltip}
      className="inline-block w-1.5 h-1.5 rounded-full shrink-0 cursor-help"
      style={{ background: color }}
    />
  );
}

function ScoreBar({ value, max, className = 'bg-current' }: { value: number | null | undefined; max: number; className?: string }) {
  const val = Number(value ?? 0);
  const pct = Math.max(0, Math.min(100, (val / max) * 100));
  return (
    <div className="w-10 h-1 rounded-full bg-white/10 overflow-hidden shrink-0">
      <div className={`h-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}


function SnapshotCell({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-slate-600 text-xs">---</span>;
  }
  return <span className="text-slate-300 text-xs font-mono">₹{fmt(value)}</span>;
}

function OutcomeBadge({ outcome }: { outcome: string | null | undefined }) {
  if (!outcome) return null;
  
  let color = '#94a3b8';
  let bg = 'rgba(148,163,184,0.1)';
  const label = outcome;
  let tooltip = '';

  if (outcome === 'MODEL_VALID') {
    color = '#22c55e'; // Green
    bg = 'rgba(34,197,94,0.1)';
    tooltip = 'Model signal was correct and execution was profitable.';
  } else if (outcome === 'EXECUTION_SLIPPAGE' || outcome === 'MODEL_WEAK') {
    color = '#eab308'; // Yellow
    bg = 'rgba(234,179,8,0.1)';
    tooltip = outcome === 'EXECUTION_SLIPPAGE' 
      ? 'Signal was TRADEABLE, but option execution lost money (possible slippage).' 
      : 'Signal was WATCHLIST quality and resulted in a loss.';
  } else if (outcome === 'GAP_FAILURE' || outcome === 'EVENT_RISK_AVOIDABLE' || outcome === 'LOW_QUALITY_SHOULD_SKIP') {
    color = '#ef4444'; // Red
    bg = 'rgba(239,68,68,0.1)';
    if (outcome === 'GAP_FAILURE') tooltip = 'Extreme adverse overnight gap blow-through (>15%).';
    if (outcome === 'EVENT_RISK_AVOIDABLE') tooltip = 'Loss occurred during a known high-risk event.';
    if (outcome === 'LOW_QUALITY_SHOULD_SKIP') tooltip = 'Trade was forced on a LOW_QUALITY signal.';
  }

  return (
    <span
      title={tooltip}
      style={{ color, background: bg, border: `1px solid ${color}40` }}
      className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase cursor-help whitespace-nowrap"
    >
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function formatRegime(regime: string | null | undefined) {
  if (!regime) return '---';
  try {
    const parsed = JSON.parse(regime);
    return `${parsed.trend ?? 'UNKNOWN'} | ${parsed.volatility ?? 'UNKNOWN'} VOL`;
  } catch {
    return regime;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

import { registerCacheClearHandler } from '@/lib/navigation-cache';

// Cache to prevent loading spinner on navigation
let _cachedEntries: JournalEntry[] | null = null;
let _cachedStats: JournalStats | null = null;
let _cachedTotal: number = 0;

registerCacheClearHandler(() => {
  _cachedEntries = null;
  _cachedStats = null;
  _cachedTotal = 0;
});

export default function JournalClient({ initialReportingData }: { initialReportingData?: ReportingResponse }) {
  const [activeTab, setActiveTab]     = useState<'LOG' | 'ANALYTICS' | 'SIGNALS' | 'COMPARE' | 'STOCK_COMPARE'>('LOG');
  const [reportingData]               = useState<ReportingResponse | null>(initialReportingData || null);
  const [entries, setEntries]         = useState<JournalEntry[]>(() => _cachedEntries || []);
  const [stats, setStats]             = useState<JournalStats | null>(() => _cachedStats || null);
  const [total, setTotal]             = useState(() => _cachedTotal || 0);
  const [page, setPage]               = useState(1);
  const [totalPages, setTotalPages]   = useState(1);
  const [loading, setLoading]         = useState(() => !_cachedEntries);
  const [error, setError]             = useState<string | null>(null);
  const [drawerStock, setDrawerStock] = useState<DrawerStockData | null>(null);
  const [drawerOpen, setDrawerOpen]   = useState(false);

  // Sync state to memory cache
  useEffect(() => {
    if (entries.length > 0) {
      _cachedEntries = entries;
      _cachedStats = stats;
      _cachedTotal = total;
    }
  }, [entries, stats, total]);

  // Filters State
  const [filters, setFilters] = useState<JournalFiltersState>({
    search: '',
    signalType: 'ALL',
    qualityBucket: 'ALL',
    executionOutcome: 'ALL',
    pnlStatus: 'ALL',
    direction: 'ALL',
    tradeStatus: 'ALL',
    fromDate: '',
    toDate: '',
  });

  // Table Sorting State
  const [sortField, setSortField] = useState<'date' | 'type' | 'symbol' | 'entry' | 'exit' | 'pnl' | 'netPnl' | 'score'>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Table Presentation States
  const [densityMode, setDensityMode] = useState<'compact' | 'detailed'>('compact');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('journal_visible_columns');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return DEFAULT_VISIBLE_COLUMNS;
  });
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Detail Drawer States
  const [selectedTrade, setSelectedTrade] = useState<JournalTradeData | null>(null);
  const [tradeDrawerOpen, setTradeDrawerOpen] = useState(false);

  // Invalidate cache and show spinner when server-side filter changes (not on mount)
  const isFirstMount = React.useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    _cachedEntries = null;
    setLoading(true);
  }, [filters.signalType, filters.fromDate, filters.toDate, filters.qualityBucket, filters.executionOutcome]);

  // Inline exit input state per row
  const [exitRow, setExitRow]         = useState<string | null>(null);
  const [exitValue, setExitValue]     = useState('');
  const [exitLoading, setExitLoading] = useState(false);
  const [exitError, setExitError]     = useState<string | null>(null);

  // Tooltip State for V2 Score breakdown on mobile
  const [activeTooltipRow, setActiveTooltipRow] = useState<string | null>(null);
  // Expand state for V2 breakdown detail section
  const [expandedV2Row, setExpandedV2Row] = useState<string>('');

  // Signal Analytics state
  const [signalAnalytics, setSignalAnalytics] = useState<{
    baselineTrades: number;
    baselineWinRate: number;
    signals: Array<{
      signal: string;
      trades: number;
      winRate: number;
      avgPnl: number;
      avgPnlPct: number;
      lift: number;
      liftExclusive: number;
      confidence: 'Low' | 'Medium' | 'High';
    }>;
  } | null>(null);
  const [signalAnalyticsLoading, setSignalAnalyticsLoading] = useState(false);

  useEffect(() => {
    if (!activeTooltipRow) return;
    const handleOutsideClick = () => {
      setActiveTooltipRow(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [activeTooltipRow]);

  useEffect(() => {
    if (activeTab !== 'SIGNALS' || signalAnalytics) return;
    setSignalAnalyticsLoading(true);
    fetch('/api/analytics/signals')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data?.signals)) setSignalAnalytics(data);
        else setSignalAnalytics({ baselineTrades: 0, baselineWinRate: 0, signals: [] });
      })
      .catch(() => setSignalAnalytics({ baselineTrades: 0, baselineWinRate: 0, signals: [] }))
      .finally(() => setSignalAnalyticsLoading(false));
  }, [activeTab, signalAnalytics]);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (p: number) => {
    if (!_cachedEntries) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: '50',
        signalType: filters.signalType,
        qualityBucket: filters.qualityBucket,
        executionOutcome: filters.executionOutcome,
        ...(filters.fromDate ? { fromDate: filters.fromDate } : {}),
        ...(filters.toDate   ? { toDate:   filters.toDate   } : {}),
      });
      const res  = await fetch(`/api/journal?${params}`);
      const data: JournalResponse = await res.json();
      if (!data.success) throw new Error('API returned error');

      setEntries(data.entries);
      setStats(data.stats);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load journal');
    } finally {
      setLoading(false);
    }
  }, [filters.signalType, filters.fromDate, filters.toDate, filters.qualityBucket, filters.executionOutcome]);

  useEffect(() => { fetchData(1); }, [fetchData]);

  const handleToggleColumn = (key: string) => {
    let updated: string[];
    if (visibleColumns.includes(key)) {
      updated = visibleColumns.filter((c) => c !== key);
    } else {
      updated = [...visibleColumns, key];
    }
    setVisibleColumns(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('journal_visible_columns', JSON.stringify(updated));
    }
  };

  const handleInspectStock = (symbol: string) => {
    const matching = entries.find((e) => e.symbol === symbol);
    setDrawerStock({
      symbol,
      ltp: matching?.exitCmp ?? matching?.entryCmp ?? 0,
      direction: matching?.signalType === 'STBT' ? 'SHORT' : 'LONG',
      score: matching?.score ?? 0,
      confidence: matching?.confidence ?? 0,
      signals: matching?.signalSummary
        ? matching.signalSummary.split(/[,\s|]+/).filter(Boolean)
        : [],
    });
    setDrawerOpen(true);
  };

  const filteredEntries = useMemo(() => {
    const list = entries.filter((e) => {
      if (filters.search) {
        const q = filters.search.toUpperCase();
        const matchSymbol = e.symbol?.toUpperCase().includes(q);
        const matchContract = e.optionContract?.toUpperCase().includes(q);
        if (!matchSymbol && !matchContract) return false;
      }
      if (filters.pnlStatus === 'WINNERS') {
        if ((e.pnl ?? 0) <= 0 && (e.pnlPct ?? 0) <= 0) return false;
      } else if (filters.pnlStatus === 'LOSERS') {
        if ((e.pnl ?? 0) >= 0 && (e.pnlPct ?? 0) >= 0) return false;
      }
      if (filters.direction === 'LONG') {
        const isLong = e.optionType === 'CE' || e.signalType === 'BTST';
        if (!isLong) return false;
      } else if (filters.direction === 'SHORT') {
        const isShort = e.optionType === 'PE' || e.signalType === 'STBT';
        if (!isShort) return false;
      }
      if (filters.tradeStatus === 'OPEN') {
        if (e.exitCmp !== null && e.exitCmp !== undefined) return false;
      } else if (filters.tradeStatus === 'CLOSED') {
        if (e.exitCmp === null || e.exitCmp === undefined) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date':
          comparison = new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime();
          break;
        case 'type':
          comparison = a.signalType.localeCompare(b.signalType);
          break;
        case 'symbol':
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case 'entry':
          comparison = (a.entryCmp ?? 0) - (b.entryCmp ?? 0);
          break;
        case 'exit':
          comparison = (a.exitCmp ?? 0) - (b.exitCmp ?? 0);
          break;
        case 'pnl':
          comparison = (a.pnl ?? 0) - (b.pnl ?? 0);
          break;
        case 'netPnl': {
          const aNet = a.estimatedNetPnl ?? a.pnl ?? 0;
          const bNet = b.estimatedNetPnl ?? b.pnl ?? 0;
          comparison = aNet - bNet;
          break;
        }
        case 'score':
          comparison = (a.score ?? 0) - (b.score ?? 0);
          break;
        default:
          comparison = 0;
      }
      return sortAsc ? comparison : -comparison;
    });

    return list;
  }, [entries, filters.search, filters.pnlStatus, filters.direction, filters.tradeStatus, sortField, sortAsc]);

  const handleSort = (field: 'date' | 'type' | 'symbol' | 'entry' | 'exit' | 'pnl' | 'netPnl' | 'score') => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(field === 'symbol' || field === 'type');
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown size={11} className="opacity-30 group-hover:opacity-70 inline ml-1 transition-opacity" />;
    }
    return sortAsc ? (
      <ArrowUp size={11} className="text-accent-blue inline ml-1 font-bold" />
    ) : (
      <ArrowDown size={11} className="text-accent-blue inline ml-1 font-bold" />
    );
  };

  // ── Manual Exit ────────────────────────────────────────────────────────────

  async function submitExit(id: string) {
    const cmp = parseFloat(exitValue);
    if (!cmp || cmp <= 0) {
      setExitError('Enter a valid positive price');
      return;
    }
    setExitLoading(true);
    setExitError(null);
    try {
      const res  = await fetch('/api/journal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, exitCmp: cmp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      setExitRow(null);
      setExitValue('');
      fetchData(page);
    } catch (e) {
      setExitError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setExitLoading(false);
    }
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────

  function exportCSV() {
    const headers = [
      'Trade Date','Type','Stock','Option','Entry CMP',
      '9:16 AM','9:30 AM','9:45 AM','Exit CMP',
      'Gross P&L (₹)','Gross P&L %',
      'Estimated Charges (₹)','Estimated Net P&L (₹)','Estimated Net P&L %','Friction Tier',
      'Advanced Score','Shadow Simple Score',
      'Quality Bucket', 'Execution Outcome', 'Event Risk', 'Regime Snapshot', 'Regime Parsed'
    ];
    const rows = filteredEntries.map(e => {
      let parsedRegime = '';
      if (e.regimeSnapshotAtSignal) {
        try {
          const r = JSON.parse(e.regimeSnapshotAtSignal);
          parsedRegime = `${r.trend || 'UNKNOWN'} / ${r.volatility || 'UNKNOWN'}`;
        } catch {
          parsedRegime = e.regimeSnapshotAtSignal;
        }
      }
      return [
        fmtDate(e.tradeDate),
        e.signalType,
        e.symbol,
        e.optionContract,
        e.entryCmp,
        e.cmp916  ?? '',
        e.cmp930  ?? '',
        e.cmp945  ?? '',
        e.exitCmp ?? '',
        e.pnl !== null && e.pnl !== undefined ? e.pnl.toFixed(2) : '',
        e.pnlPct  !== null && e.pnlPct !== undefined ? e.pnlPct.toFixed(2) : '',
        e.estimatedCharges !== null && e.estimatedCharges !== undefined ? e.estimatedCharges.toFixed(2) : '',
        e.estimatedNetPnl !== null && e.estimatedNetPnl !== undefined ? e.estimatedNetPnl.toFixed(2) : '',
        e.estimatedNetPnlPct !== null && e.estimatedNetPnlPct !== undefined ? e.estimatedNetPnlPct.toFixed(2) : '',
        e.frictionModelTier ?? 'FUTURES_PROXY',
        e.score,
        e.scoreV2 ?? '',
        e.qualityBucketAtSignal ?? '',
        e.executionOutcome ?? '',
        e.eventRiskScoreAtSignal ?? '',
        e.regimeSnapshotAtSignal ? e.regimeSnapshotAtSignal.replace(/"/g, '""') : '',
        parsedRegime
      ];
    });
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${v}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `trade-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Chart data ─────────────────────────────────────────────────────────────

  const winRateChartData = stats ? [
    { name: 'CPR',  value: stats.byType.CPR.winRate,  fill: SIGNAL_COLORS.CPR  },
    { name: 'BTST', value: stats.byType.BTST.winRate, fill: SIGNAL_COLORS.BTST },
    { name: 'STBT', value: stats.byType.STBT.winRate, fill: SIGNAL_COLORS.STBT },
  ] : [];

  const exitTimeChartData = [
    { name: '9:16 AM',  value: computeAvgAtTime(entries, 'cmp916')  },
    { name: '9:30 AM',  value: computeAvgAtTime(entries, 'cmp930')  },
    { name: '9:45 AM',  value: computeAvgAtTime(entries, 'cmp945')  },
  ];

  const paddingClass = densityMode === 'compact' ? 'py-1.5 px-2.5 text-[11px]' : 'py-3 px-3 text-xs';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <div className="max-w-[1440px] mx-auto px-4 py-8 space-y-6">

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight font-mono">
              Trade Journal
            </h1>
            <p className="text-text-secondary text-sm mt-0.5">
              Live option trade tracking &mdash; CPR &bull; BTST &bull; STBT execution workstation
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-bg-secondary p-1 rounded-lg border border-border-primary mr-0 sm:mr-4 font-mono overflow-x-auto max-w-full">
              <button
                onClick={() => setActiveTab('LOG')}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'LOG' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-bg-primary/50'
                }`}
              >
                Trade Log
              </button>
              <button
                onClick={() => setActiveTab('ANALYTICS')}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'ANALYTICS' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-bg-primary/50'
                }`}
              >
                Analytics
              </button>
              <button
                id="journal-signals-tab-btn"
                onClick={() => setActiveTab('SIGNALS')}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'SIGNALS' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-bg-primary/50'
                }`}
              >
                Signals
              </button>
              <button
                onClick={() => setActiveTab('COMPARE')}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'COMPARE' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-bg-primary/50'
                }`}
              >
                Index BTST
              </button>
              <button
                onClick={() => setActiveTab('STOCK_COMPARE')}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  activeTab === 'STOCK_COMPARE' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-bg-primary/50'
                }`}
              >
                Stock BTST
              </button>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <button
                id="journal-refresh-btn"
                onClick={() => fetchData(1)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-secondary text-text-secondary hover:text-text-primary hover:border-border-tertiary text-xs font-medium transition-all disabled:opacity-40 font-mono"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                id="journal-export-btn"
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-secondary text-text-secondary hover:text-text-primary hover:border-border-tertiary text-xs font-medium transition-all font-mono"
              >
                <Download size={12} />
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'ANALYTICS' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* ── Executive Visual Analytics View ── */}
            <JournalAnalyticsView
              entries={entries}
              reportingData={reportingData}
            />

            {/* ── No-data empty state ── */}
            {(!reportingData || (reportingData.qualityBuckets.length === 0 && reportingData.executionOutcomes.length === 0)) && (
              <div className="rounded-xl border border-border-primary bg-bg-secondary p-12 text-center">
                <div className="text-4xl mb-3">📊</div>
                <div className="text-text-secondary font-semibold mb-1">Not enough completed trades to generate analytics.</div>
                <div className="text-text-tertiary text-xs">Close at least 5 trades to unlock strategy insights.</div>
              </div>
            )}

            {reportingData && (
              <>
                {/* ── 1. KPI Cards ── */}
                {(() => {
                  const closed = (stats ? (stats.totalClosedTrades ?? stats.totalTrades) : reportingData.qualityBuckets.reduce((s, b) => s + b.count, 0)) ?? 0;
                  const wins   = reportingData.executionOutcomes.find(b => b.groupValue === 'MODEL_VALID')?.count ?? 0;
                  const wr     = stats ? stats.winRate : (closed > 0 ? (wins / closed) * 100 : 0);
                  const avgPnl = stats ? stats.avgPnlPct : (reportingData.qualityBuckets.reduce((s, b) => s + b.avgPnlPct * b.count, 0) / (closed || 1));
                  const grossWin  = reportingData.executionOutcomes.filter(b => b.avgPnlPct > 0).reduce((s, b) => s + Math.abs(b.avgPnlPct) * b.count, 0);
                  const grossLoss = reportingData.executionOutcomes.filter(b => b.avgPnlPct < 0).reduce((s, b) => s + Math.abs(b.avgPnlPct) * b.count, 0);
                  const pf = grossLoss > 0 ? (grossWin / grossLoss) : (grossWin > 0 ? 999 : 0);
                  const expectancy = (wr / 100) * avgPnl - ((100 - wr) / 100) * Math.abs(Math.min(avgPnl, 0));
                  const variance = reportingData.variance.averageVariancePct;

                  const kpis = [
                    { label: 'Closed Trades', value: String(closed), color: '#3b82f6', good: closed >= 10, neutral: closed >= 5 },
                    { label: 'Win Rate', value: `${wr.toFixed(1)}%`, color: wr >= 55 ? '#22c55e' : wr >= 45 ? '#eab308' : '#ef4444', good: wr >= 55, neutral: wr >= 45 },
                    { label: 'Avg PnL %', value: `${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}%`, color: avgPnl >= 0 ? '#22c55e' : '#ef4444', good: avgPnl >= 5, neutral: avgPnl >= 0 },
                    { label: 'Profit Factor', value: pf >= 999 ? '∞' : pf.toFixed(2), color: pf >= 1.5 ? '#22c55e' : pf >= 1.0 ? '#eab308' : '#ef4444', good: pf >= 1.5, neutral: pf >= 1.0 },
                    { label: 'Expectancy', value: `${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)}%`, color: expectancy >= 0 ? '#22c55e' : '#ef4444', good: expectancy >= 3, neutral: expectancy >= 0 },
                    { label: 'Exec Variance', value: `${variance >= 0 ? '+' : ''}${variance.toFixed(2)}%`, color: variance >= -2 ? '#22c55e' : '#ef4444', good: variance >= -2, neutral: variance >= -5 },
                  ];

                  return (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {kpis.map(k => (
                        <div key={k.label}
                          style={{ borderColor: `${k.color}28`, background: `${k.color}08` }}
                          className="rounded-xl border p-3 flex flex-col gap-1 min-w-0">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{k.label}</span>
                          <span style={{ color: k.color }} className="text-lg font-bold leading-tight font-mono">{k.value}</span>
                          <span className="text-[9px] font-semibold"
                            style={{ color: k.good ? '#22c55e' : k.neutral ? '#eab308' : '#ef4444' }}>
                            {k.good ? '● Good' : k.neutral ? '● Neutral' : '● Poor'}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* ── 2+3: Quality Buckets & Execution Outcomes ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* Quality Bucket Performance */}
                  <div className="rounded-xl border border-border-primary bg-bg-secondary overflow-hidden">
                    <div className="p-4 border-b border-border-primary/50">
                      <h3 className="text-sm font-semibold text-white">Quality Bucket Performance</h3>
                      <p className="text-[10px] text-text-tertiary mt-0.5">Signal classification breakdown</p>
                    </div>
                    <div className="divide-y divide-slate-800/40">
                      {(() => {
                        const total = reportingData.qualityBuckets.reduce((s, b) => s + b.count, 0);
                        const labelMap: Record<string, string> = {
                          TRADEABLE: 'Tradeable', WATCHLIST: 'Watchlist', LOW_QUALITY: 'Low Quality',
                        };
                        const colorMap: Record<string, string> = {
                          TRADEABLE: '#22c55e', WATCHLIST: '#eab308', LOW_QUALITY: '#ef4444',
                        };
                        return reportingData.qualityBuckets.map(b => {
                          const contrib = total > 0 ? ((b.count / total) * 100) : 0;
                          const col = colorMap[b.groupValue] ?? '#94a3b8';
                          return (
                            <div key={b.groupValue} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                              <div className="flex items-center justify-between mb-1.5">
                                <span style={{ color: col }} className="text-xs font-bold">{labelMap[b.groupValue] ?? b.groupValue}</span>
                                <span className={`text-xs font-mono font-semibold ${b.avgPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {b.avgPnlPct >= 0 ? '+' : ''}{b.avgPnlPct.toFixed(2)}%
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className="flex-1 h-1.5 rounded-full bg-bg-primary overflow-hidden">
                                  <div style={{ width: `${contrib}%`, background: col }} className="h-full rounded-full transition-all" />
                                </div>
                                <span className="text-[10px] text-slate-500 font-mono w-8 text-right">{contrib.toFixed(0)}%</span>
                              </div>
                              <div className="flex gap-3 text-[10px] text-slate-500">
                                <span>Trades: <span className="text-slate-300 font-semibold">{b.count}</span></span>
                                <span>Win Rate: <span className="text-slate-300 font-semibold">{b.winRate.toFixed(1)}%</span></span>
                                <span>Contribution: <span className="text-slate-300 font-semibold">{contrib.toFixed(0)}%</span></span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Execution Outcomes */}
                  <div className="rounded-xl border border-border-primary bg-bg-secondary overflow-hidden">
                    <div className="p-4 border-b border-border-primary/50">
                      <h3 className="text-sm font-semibold text-white">Execution Outcomes</h3>
                      <p className="text-[10px] text-text-tertiary mt-0.5">What happened after the signal fired</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-bg-primary text-slate-500">
                        <tr>
                          <th className="px-4 py-2 font-medium">Outcome</th>
                          <th className="px-4 py-2 font-medium text-right">Trades</th>
                          <th className="px-4 py-2 font-medium text-right">Win %</th>
                          <th className="px-4 py-2 font-medium text-right">Avg PnL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {reportingData.executionOutcomes.map(b => (
                          <tr key={b.groupValue} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-2.5"><OutcomeBadge outcome={b.groupValue} /></td>
                            <td className="px-4 py-2.5 text-right text-slate-300">{b.count}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span style={{ color: b.winRate >= 50 ? '#22c55e' : b.winRate >= 33 ? '#eab308' : '#ef4444' }}
                                className="font-mono font-semibold">{b.winRate.toFixed(1)}%</span>
                            </td>
                            <td className={`px-4 py-2.5 text-right font-mono font-semibold ${b.avgPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {b.avgPnlPct >= 0 ? '+' : ''}{b.avgPnlPct.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>

                {/* ── 4+5: Regime + Strategy ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* Regime Performance */}
                  <div className="rounded-xl border border-border-primary bg-bg-secondary overflow-hidden">
                    <div className="p-4 border-b border-border-primary/50">
                      <h3 className="text-sm font-semibold text-white">Regime Performance</h3>
                      <p className="text-[10px] text-text-tertiary mt-0.5">Market condition × strategy fit</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-bg-primary text-slate-500">
                        <tr>
                          <th className="px-4 py-2 font-medium">Regime</th>
                          <th className="px-4 py-2 font-medium text-right">Trades</th>
                          <th className="px-4 py-2 font-medium text-right">Win %</th>
                          <th className="px-4 py-2 font-medium text-right">Avg PnL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {reportingData.regimes.length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-600 text-xs italic">No regime data yet</td></tr>
                        ) : reportingData.regimes.map(b => {
                          const label = formatRegime(b.groupValue);
                          const isUnknown = !b.groupValue || label === '---' || label.toLowerCase().includes('unknown');
                          if (isUnknown && b.count === 0) return null;
                          const regimeColor = label.toLowerCase().includes('bull') ? '#22c55e'
                            : label.toLowerCase().includes('bear') ? '#ef4444'
                            : label.toLowerCase().includes('sideways') ? '#eab308' : '#94a3b8';
                          return (
                            <tr key={b.groupValue} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span style={{ background: regimeColor }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                                  <span className="text-slate-300 font-medium">{label}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right text-slate-300">{b.count}</td>
                              <td className="px-4 py-2.5 text-right">
                                <span style={{ color: b.winRate >= 50 ? '#22c55e' : b.winRate >= 33 ? '#eab308' : '#ef4444' }}
                                  className="font-mono font-semibold">{b.winRate.toFixed(1)}%</span>
                              </td>
                              <td className={`px-4 py-2.5 text-right font-mono font-semibold ${b.avgPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {b.avgPnlPct >= 0 ? '+' : ''}{b.avgPnlPct.toFixed(2)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>

                  {/* Strategy Comparison */}
                  {stats && (
                    <div className="rounded-xl border border-border-primary bg-bg-secondary overflow-hidden">
                      <div className="p-4 border-b border-border-primary/50">
                        <h3 className="text-sm font-semibold text-white">Strategy Comparison</h3>
                        <p className="text-[10px] text-text-tertiary mt-0.5">Which signal type performs best</p>
                      </div>
                      <div className="divide-y divide-slate-800/40">
                        {(['CPR', 'BTST', 'STBT'] as const).map(sig => {
                          const d = stats.byType[sig];
                          if (!d || d.count === 0) return null;
                          const col = SIGNAL_COLORS[sig];
                          const isBest = stats.bestSignalType === sig;
                          return (
                            <div key={sig} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span style={{ color: col, background: `${col}18`, border: `1px solid ${col}40` }}
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider">{sig}</span>
                                  {isBest && (
                                    <span className="text-[9px] text-amber-400 font-bold">★ Best</span>
                                  )}
                                </div>
                                <span style={{ color: d.winRate >= 55 ? '#22c55e' : d.winRate >= 40 ? '#eab308' : '#ef4444' }}
                                  className="text-xs font-bold font-mono">{d.winRate.toFixed(1)}% WR</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-bg-primary overflow-hidden mb-1.5">
                                <div style={{ width: `${Math.min(d.winRate, 100)}%`, background: col }} className="h-full rounded-full" />
                              </div>
                              <div className="flex gap-3 text-[10px] text-slate-500">
                                <span>Trades: <span className="text-slate-300 font-semibold">{d.count}</span></span>
                                <span>Win Rate: <span className="text-slate-300 font-semibold">{d.winRate.toFixed(1)}%</span></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 6. Event Risk & Loss Analysis ── */}
                {(reportingData.eventRisks?.length > 0) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="rounded-xl border border-border-primary bg-bg-secondary overflow-hidden">
                      <div className="p-4 border-b border-border-primary/50">
                        <h3 className="text-sm font-semibold text-white">Event Risk Impact</h3>
                        <p className="text-[10px] text-text-tertiary mt-0.5">How event risk affects outcomes</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-bg-primary text-slate-500">
                          <tr>
                            <th className="px-4 py-2 font-medium">Event Risk</th>
                            <th className="px-4 py-2 font-medium text-right">Trades</th>
                            <th className="px-4 py-2 font-medium text-right">Win %</th>
                            <th className="px-4 py-2 font-medium text-right">Avg PnL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {reportingData.eventRisks.map(b => (
                            <tr key={b.groupValue} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-2.5 text-slate-300 font-medium text-xs">
                                {b.groupValue === 'NONE' ? '✓ No Event Risk' : b.groupValue === 'HIGH' ? '⚠ High Risk' : b.groupValue === 'MEDIUM' ? '⚡ Medium Risk' : b.groupValue}
                              </td>
                              <td className="px-4 py-2.5 text-right text-slate-300">{b.count}</td>
                              <td className="px-4 py-2.5 text-right">
                                <span style={{ color: b.winRate >= 50 ? '#22c55e' : b.winRate >= 33 ? '#eab308' : '#ef4444' }}
                                  className="font-mono font-semibold">{b.winRate.toFixed(1)}%</span>
                              </td>
                              <td className={`px-4 py-2.5 text-right font-mono font-semibold ${b.avgPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {b.avgPnlPct >= 0 ? '+' : ''}{b.avgPnlPct.toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </div>

                    {/* Loss Analysis */}
                    <div className="rounded-xl border border-border-primary bg-bg-secondary overflow-hidden">
                      <div className="p-4 border-b border-border-primary/50">
                        <h3 className="text-sm font-semibold text-white">Loss Analysis</h3>
                        <p className="text-[10px] text-text-tertiary mt-0.5">Top reasons trades underperform</p>
                      </div>
                      <div className="divide-y divide-slate-800/40">
                        {reportingData.executionOutcomes
                          .filter(b => b.avgPnlPct < 0)
                          .sort((a, b) => a.avgPnlPct - b.avgPnlPct)
                          .map(b => {
                            const severity = b.avgPnlPct < -15 ? '#ef4444' : b.avgPnlPct < -8 ? '#f97316' : '#eab308';
                            return (
                              <div key={b.groupValue} className="px-4 py-3 flex items-center gap-3">
                                <div style={{ background: severity }} className="w-1 h-8 rounded-full shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <OutcomeBadge outcome={b.groupValue} />
                                    <span className="text-red-400 font-mono font-bold text-xs">{b.avgPnlPct.toFixed(2)}%</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">{b.count} trades · {b.winRate.toFixed(0)}% win rate</div>
                                </div>
                              </div>
                            );
                          })}
                        {reportingData.executionOutcomes.filter(b => b.avgPnlPct < 0).length === 0 && (
                          <div className="px-4 py-6 text-center text-green-400 text-xs font-semibold">🎉 No loss categories yet!</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 7. Option vs Spot Delta Card ── */}
                <div className="rounded-xl border border-border-primary/50 bg-bg-secondary p-4 flex items-start gap-4">
                  <div style={{ background: (reportingData.variance.averageVariancePct >= -2 ? '#22c55e' : '#ef4444') + '18', color: reportingData.variance.averageVariancePct >= -2 ? '#22c55e' : '#ef4444' }}
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 text-lg">
                    <Activity size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Option vs Spot Delta</div>
                    <div style={{ color: reportingData.variance.averageVariancePct >= -2 ? '#22c55e' : '#ef4444' }}
                      className="text-2xl font-bold font-mono">
                      {reportingData.variance.averageVariancePct >= 0 ? '+' : ''}{reportingData.variance.averageVariancePct.toFixed(2)}%
                    </div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">
                      Option premium % minus underlying spot move % (leverage delta, not fill slippage) · {reportingData.variance.sampleSize} trades sampled
                    </div>
                    <div className="mt-2 text-[10px]" style={{ color: reportingData.variance.averageVariancePct >= -2 ? '#22c55e' : '#ef4444' }}>
                      {reportingData.variance.averageVariancePct >= -2
                        ? '● Option leverage is close to the underlying move'
                        : '● Option premium moved far from the spot model — review strike selection'}
                    </div>
                  </div>
                </div>

              </>
            )}
          </div>
        )}

        {/* ── Signal Analytics Tab ─────────────────────────────────────────── */}
        {activeTab === 'SIGNALS' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Signal Analytics</h2>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Every signal is scored against your closed trades. <span className="text-slate-400">Lift</span> = signal Win% − baseline Win%.
                </p>
              </div>
              <button
                id="signals-refresh-btn"
                onClick={() => { setSignalAnalytics(null); setSignalAnalyticsLoading(true); fetch('/api/analytics/signals').then(r => r.json()).then(data => { if (Array.isArray(data?.signals)) setSignalAnalytics(data); else setSignalAnalytics({ baselineTrades: 0, baselineWinRate: 0, signals: [] }); }).catch(() => setSignalAnalytics({ baselineTrades: 0, baselineWinRate: 0, signals: [] })).finally(() => setSignalAnalyticsLoading(false)); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-secondary text-text-secondary hover:text-text-primary hover:border-border-tertiary text-xs font-medium transition-all"
              >
                <RefreshCw size={12} className={signalAnalyticsLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {signalAnalyticsLoading && (
              <div className="rounded-xl border border-border-primary bg-bg-secondary p-12 text-center text-slate-500 text-sm">
                Loading signal data…
              </div>
            )}

            {!signalAnalyticsLoading && signalAnalytics && signalAnalytics.signals.length === 0 && (
              <div className="rounded-xl border border-border-primary bg-bg-secondary p-12 text-center">
                <div className="text-4xl mb-3">📈</div>
                <div className="text-slate-400 font-semibold mb-1">No closed trades yet.</div>
                <div className="text-slate-600 text-xs">Signal analytics will appear once trades close with P&amp;L data.</div>
              </div>
            )}

            {!signalAnalyticsLoading && signalAnalytics && signalAnalytics.signals.length > 0 && (
              <>
                {/* Baseline KPI */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border-primary bg-bg-secondary p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1">Baseline Trades</div>
                    <div className="text-2xl font-bold font-mono text-white">{signalAnalytics.baselineTrades}</div>
                    <div className="text-[10px] text-text-tertiary mt-1">All closed journal trades</div>
                  </div>
                  <div className="rounded-xl border border-border-primary bg-bg-secondary p-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1">Baseline Win Rate</div>
                    <div className="text-2xl font-bold font-mono" style={{ color: signalAnalytics.baselineWinRate >= 55 ? '#22c55e' : signalAnalytics.baselineWinRate >= 45 ? '#eab308' : '#ef4444' }}>
                      {signalAnalytics.baselineWinRate.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-text-tertiary mt-1">Strategy-wide win rate</div>
                  </div>
                </div>

                {/* Signal Table */}
                <div className="rounded-xl border border-border-primary bg-bg-secondary overflow-hidden">
                  <div className="p-4 border-b border-border-primary/50">
                    <h3 className="text-sm font-semibold text-white">Per-Signal Performance</h3>
                    <p className="text-[10px] text-text-tertiary mt-0.5">Sorted by trade count. Confidence: Low &lt;30 · Medium 30-100 · High 100+</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-bg-primary text-slate-500">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Signal</th>
                          <th className="px-4 py-2.5 font-medium text-right">Trades</th>
                          <th className="px-4 py-2.5 font-medium text-right">Win %</th>
                          <th className="px-4 py-2.5 font-medium text-right">Avg P&amp;L %</th>
                          <th className="px-4 py-2.5 font-medium text-right" title="Signal Win% - Baseline Win% (baseline includes ALL trades)">Lift (Incl)</th>
                          <th className="px-4 py-2.5 font-medium text-right" title="Signal Win% - Baseline Win% (baseline excludes this signal's trades)">Lift (Excl)</th>
                          <th className="px-4 py-2.5 font-medium text-center">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {signalAnalytics.signals.map(s => {
                          const liftColor = s.lift > 0 ? '#22c55e' : s.lift < 0 ? '#ef4444' : '#94a3b8';
                          const liftExclColor = s.liftExclusive > 0 ? '#22c55e' : s.liftExclusive < 0 ? '#ef4444' : '#94a3b8';
                          const wrColor   = s.winRate >= 55 ? '#22c55e' : s.winRate >= 45 ? '#eab308' : '#ef4444';
                          const confColor = s.confidence === 'High' ? '#22c55e' : s.confidence === 'Medium' ? '#eab308' : '#64748b';
                          const confBg    = s.confidence === 'High' ? 'rgba(34,197,94,0.1)' : s.confidence === 'Medium' ? 'rgba(234,179,8,0.1)' : 'rgba(100,116,139,0.1)';
                          const isHp    = s.signal.startsWith('HP_') || s.signal.startsWith('KGS_');
                          return (
                            <tr key={s.signal} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-2.5">
                                <span
                                  style={isHp ? { color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)' } : {}}
                                  className={`font-mono text-[11px] font-semibold ${isHp ? 'px-1.5 py-0.5 rounded' : 'text-slate-300'}`}
                                >
                                  {s.signal.replace(/^KGS_/, 'HP_')}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-slate-400">{s.trades}</td>
                              <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: wrColor }}>
                                {s.winRate.toFixed(1)}%
                              </td>
                              <td className={`px-4 py-2.5 text-right font-mono font-semibold ${s.avgPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {s.avgPnlPct >= 0 ? '+' : ''}{s.avgPnlPct.toFixed(2)}%
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: liftColor }}>
                                {s.lift > 0 ? '+' : ''}{s.lift.toFixed(1)}%
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: liftExclColor }}>
                                {s.liftExclusive > 0 ? '+' : ''}{s.liftExclusive.toFixed(1)}%
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <span
                                  style={{ color: confColor, background: confBg, border: `1px solid ${confColor}40` }}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase"
                                >
                                  {s.confidence}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Legend */}
                <div className="rounded-xl border border-border-primary/50 bg-bg-secondary p-4 text-[10px] text-text-tertiary space-y-1">
                  <div className="font-semibold text-slate-400 text-[11px] mb-2">How to read this table</div>
                  <div>● <span className="text-slate-300">Lift (Incl)</span> = signal Win% − {signalAnalytics.baselineWinRate.toFixed(1)}% baseline (includes the signal&apos;s own trades).</div>
                  <div>● <span className="text-slate-300">Lift (Excl)</span> = signal Win% − Win% of trades WITHOUT this signal. Stricter baseline; isolates the signal&apos;s true differentiating edge.</div>
                  <div>● <span className="text-violet-400">Purple signals</span> are KGS-family (observational only — zero score impact until validated).</div>
                  <div>● <span className="text-yellow-400">Low confidence</span> (&lt;30 trades) — statistically inconclusive. Do not promote to scoring yet.</div>
                  <div>● Target <span className="text-slate-300">200–500 trades</span> before using Lift to make promotion decisions.</div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Index BTST Compare Tab ───────────────────────────────────────── */}
        {activeTab === 'COMPARE' && (
          <div className="p-4">
            <IndexBtstComparePanel />
          </div>
        )}

        {/* ── Stock BTST Compare Tab ───────────────────────────────────────── */}
        {activeTab === 'STOCK_COMPARE' && (
          <div className="p-4">
            <StockBtstComparePanel />
          </div>
        )}

        {activeTab === 'LOG' && (
          <>
            {/* ── Enterprise Execution KPI Strip ── */}
            <JournalKpiStrip
              stats={stats}
              entries={filteredEntries}
              totalFiltered={total}
            />

            {/* ── Enterprise Filter Bar & Column Settings ── */}
            <div className="relative">
              <JournalFilters
                filters={filters}
                onChange={setFilters}
                onReset={() => {
                  setFilters({
                    search: '',
                    signalType: 'ALL',
                    qualityBucket: 'ALL',
                    executionOutcome: 'ALL',
                    pnlStatus: 'ALL',
                    direction: 'ALL',
                    tradeStatus: 'ALL',
                    fromDate: '',
                    toDate: '',
                  });
                }}
                densityMode={densityMode}
                onToggleDensity={() => setDensityMode((m) => (m === 'compact' ? 'detailed' : 'compact'))}
                onOpenColumnSettings={() => setShowColumnSettings((v) => !v)}
              />

              {/* Column Settings Popover */}
              {showColumnSettings && (
                <div className="absolute right-0 top-full mt-2 z-30 bg-bg-secondary border border-border-secondary p-3 rounded-lg shadow-2xl font-mono text-xs space-y-2 w-72">
                  <div className="font-bold text-text-primary border-b border-border-primary pb-1 flex justify-between items-center">
                    <span>Visible Table Columns</span>
                    <button
                      type="button"
                      onClick={() => setShowColumnSettings(false)}
                      className="text-text-tertiary hover:text-text-primary"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {COLUMN_DEFS.map((col) => (
                      <label
                        key={col.key}
                        className={`flex items-center gap-2 text-[11px] ${
                          col.required ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(col.key)}
                          disabled={col.required}
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

            {/* ── Enterprise Execution Table ── */}
            <div className="rounded-xl border border-border-primary bg-bg-secondary overflow-hidden">
              {error && (
                <div className="p-6 text-center text-accent-red text-sm font-mono">{error}</div>
              )}
              {loading && entries.length === 0 && (
                <div className="p-10 text-center text-text-tertiary text-sm animate-pulse font-mono">
                  Loading journal entries…
                </div>
              )}
              {!error && !loading && filteredEntries.length === 0 && (
                <div className="p-10 text-center text-text-tertiary text-sm font-mono">
                  {entries.length === 0
                    ? `No journal entries yet. Entries appear after the ${BTST_CLOCK.journalStart}–${BTST_CLOCK.journalEnd} IST journal cron on trading days.`
                    : 'No entries match the current filter criteria.'}
                </div>
              )}
              {filteredEntries.length > 0 && (
                <div className="overflow-x-auto">
                  <div className="px-4 py-2 border-b border-border-primary/60 text-[10px] text-text-tertiary flex flex-wrap gap-x-4 gap-y-1 font-mono">
                    <span>
                      <span className="text-text-primary font-semibold">Advanced</span> = Overnight Engine score (0–130) — trade source of truth
                    </span>
                    <span>
                      <span className="text-text-secondary font-semibold">Shadow</span> = Simple V2 (0–100) — research only, hover for breakdown
                    </span>
                    <span>
                      <span className="text-accent-green font-semibold">Net P&amp;L</span> = Modeled post-statutory &amp; broker estimate (Gross remains source of truth)
                    </span>
                  </div>
                  <table className="w-full text-xs whitespace-nowrap font-mono">
                    <thead className="sticky top-0 z-20 bg-bg-secondary/95 backdrop-blur-md border-b border-border-primary text-text-secondary uppercase tracking-wider text-[10px]">
                      <tr>
                        {visibleColumns.includes('date') && (
                          <th
                            onClick={() => handleSort('date')}
                            className="group text-left px-3 py-2.5 font-semibold cursor-pointer hover:text-text-primary transition-colors select-none"
                          >
                            <div className="flex items-center gap-1">
                              <span>Trade Date</span>
                              {renderSortIcon('date')}
                            </div>
                          </th>
                        )}
                        {visibleColumns.includes('type') && (
                          <th
                            onClick={() => handleSort('type')}
                            className="group text-left px-3 py-2.5 font-semibold cursor-pointer hover:text-text-primary transition-colors select-none"
                          >
                            <div className="flex items-center gap-1">
                              <span>Type</span>
                              {renderSortIcon('type')}
                            </div>
                          </th>
                        )}
                        {visibleColumns.includes('symbol') && (
                          <th
                            onClick={() => handleSort('symbol')}
                            className="sticky left-0 z-10 bg-bg-secondary group text-left px-3 py-2.5 font-semibold cursor-pointer hover:text-text-primary transition-colors select-none"
                          >
                            <div className="flex items-center gap-1">
                              <span>Stock</span>
                              {renderSortIcon('symbol')}
                            </div>
                          </th>
                        )}
                        {visibleColumns.includes('contract') && <th className="text-left px-3 py-2.5 font-semibold">Option</th>}
                        {visibleColumns.includes('entry') && (
                          <th
                            onClick={() => handleSort('entry')}
                            className="group text-right px-3 py-2.5 font-semibold cursor-pointer hover:text-text-primary transition-colors select-none"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Entry CMP</span>
                              {renderSortIcon('entry')}
                            </div>
                          </th>
                        )}
                        {visibleColumns.includes('cmp916') && <th className="text-right px-3 py-2.5 font-semibold">9:16 AM</th>}
                        {visibleColumns.includes('cmp930') && <th className="text-right px-3 py-2.5 font-semibold">9:30 AM</th>}
                        {visibleColumns.includes('cmp945') && <th className="text-right px-3 py-2.5 font-semibold">9:45 AM</th>}
                        {visibleColumns.includes('exit') && (
                          <th
                            onClick={() => handleSort('exit')}
                            className="group text-right px-3 py-2.5 font-semibold cursor-pointer hover:text-text-primary transition-colors select-none"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Exit CMP</span>
                              {renderSortIcon('exit')}
                            </div>
                          </th>
                        )}
                        {visibleColumns.includes('pnl') && (
                          <th
                            onClick={() => handleSort('pnl')}
                            className="group text-right px-3 py-2.5 font-semibold cursor-pointer hover:text-text-primary transition-colors select-none"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Gross P&amp;L</span>
                              <span className="text-[8px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">FACT</span>
                              {renderSortIcon('pnl')}
                            </div>
                          </th>
                        )}
                        {visibleColumns.includes('netPnl') && (
                          <th
                            onClick={() => handleSort('netPnl')}
                            className="group text-right px-3 py-2.5 font-semibold cursor-pointer hover:text-text-primary transition-colors select-none"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Est. Net P&amp;L</span>
                              <span className="text-[8px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">MODEL</span>
                              {renderSortIcon('netPnl')}
                            </div>
                          </th>
                        )}
                        {visibleColumns.includes('score') && (
                          <th
                            onClick={() => handleSort('score')}
                            className="group text-right px-3 py-2.5 font-semibold cursor-pointer hover:text-text-primary transition-colors select-none"
                            title="Advanced Engine overnightScore (0–130) — source of truth for journal picks, UI, and Telegram"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Advanced</span>
                              {renderSortIcon('score')}
                            </div>
                          </th>
                        )}
                        {visibleColumns.includes('scoreV2') && (
                          <th className="text-right px-3 py-2.5 font-semibold text-text-tertiary" title="Simple Engine V2 shadow (0–100) — research only, does not select trades">
                            Shadow
                          </th>
                        )}
                        {visibleColumns.includes('action') && <th className="text-center px-3 py-2.5 font-semibold">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-primary/60">
                      {filteredEntries.map((entry, index) => (
                        <tr
                          key={entry.id}
                          onClick={() => {
                            setSelectedTrade(entry);
                            setTradeDrawerOpen(true);
                          }}
                          className="group hover:bg-bg-tertiary/40 cursor-pointer transition-colors"
                        >
                          {visibleColumns.includes('date') && (
                            <td className={`px-3 text-text-secondary whitespace-nowrap ${paddingClass}`}>
                              {fmtDate(entry.tradeDate)}
                            </td>
                          )}
                          {visibleColumns.includes('type') && (
                            <td className={`px-3 ${paddingClass}`}>
                              <div className="flex items-center gap-1.5">
                                <SignalBadge type={entry.signalType} qualityBucket={entry.qualityBucketAtSignal} />
                                <OutcomeDot outcome={entry.executionOutcome} />
                              </div>
                            </td>
                          )}
                          {visibleColumns.includes('symbol') && (
                            <td className={`sticky left-0 z-10 bg-bg-secondary group-hover:bg-bg-tertiary/40 font-semibold text-text-primary ${paddingClass}`}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleInspectStock(entry.symbol);
                                }}
                                className="hover:text-accent-blue transition-colors text-left"
                                title="Open Stock Quantitative Detail Drawer"
                              >
                                {entry.symbol}
                              </button>
                            </td>
                          )}
                          {visibleColumns.includes('contract') && (
                            <td className={`px-3 text-text-secondary whitespace-nowrap ${paddingClass}`}>
                              {entry.optionContract.startsWith('UNDERLYING') ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-bg-tertiary text-text-secondary border border-border-secondary">
                                  {entry.optionContract}
                                </span>
                              ) : (
                                entry.optionContract
                              )}
                            </td>
                          )}
                          {visibleColumns.includes('entry') && (
                            <td className={`px-3 text-right text-text-primary ${paddingClass}`}>
                              ₹{fmt(entry.entryCmp)}
                            </td>
                          )}
                          {visibleColumns.includes('cmp916') && (
                            <td className={`px-3 text-right ${paddingClass}`}>
                              <SnapshotCell value={entry.cmp916} />
                            </td>
                          )}
                          {visibleColumns.includes('cmp930') && (
                            <td className={`px-3 text-right ${paddingClass}`}>
                              <SnapshotCell value={entry.cmp930} />
                            </td>
                          )}
                          {visibleColumns.includes('cmp945') && (
                            <td className={`px-3 text-right ${paddingClass}`}>
                              <SnapshotCell value={entry.cmp945} />
                            </td>
                          )}
                          {visibleColumns.includes('exit') && (
                            <td className={`px-3 text-right ${paddingClass}`}>
                              {entry.exitCmp !== null ? (
                                <span className="text-text-primary">₹{fmt(entry.exitCmp)}</span>
                              ) : (
                                <span className="text-text-tertiary">---</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.includes('pnl') && (
                            <td className={`px-3 text-right font-semibold ${paddingClass}`}>
                              {entry.pnlPct !== null && entry.pnlPct !== undefined ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]"
                                    style={{
                                      color: pnlColor(entry.pnlPct),
                                      background: entry.pnlPct >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                    }}
                                    title="Gross P&L (Authoritative Exchange Settlement)"
                                  >
                                    {entry.pnlPct >= 0 ? '▲' : '▼'} {entry.pnlPct >= 0 ? '+' : ''}{fmt(entry.pnlPct)}%
                                  </span>
                                  {entry.pnl !== null && entry.pnl !== undefined && (
                                    <span className="text-[10px] text-text-tertiary font-mono">
                                      {entry.pnl >= 0 ? '+' : ''}₹{fmt(entry.pnl)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-text-tertiary">---</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.includes('netPnl') && (
                            <td className={`px-3 text-right ${paddingClass}`}>
                              {entry.estimatedNetPnlPct !== null && entry.estimatedNetPnlPct !== undefined ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span
                                    className="text-[11px] font-semibold"
                                    style={{ color: pnlColor(entry.estimatedNetPnlPct) }}
                                    title={`Model Estimate: Est. Net ${entry.estimatedNetPnlPct >= 0 ? '+' : ''}${fmt(entry.estimatedNetPnlPct)}% (₹${fmt(entry.estimatedCharges ?? 0)} fees)`}
                                  >
                                    {entry.estimatedNetPnlPct >= 0 ? '+' : ''}{fmt(entry.estimatedNetPnlPct)}%
                                  </span>
                                  <span className="text-[9px] text-accent-amber font-mono">
                                    -₹{fmt(entry.estimatedCharges ?? 0)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-text-tertiary">---</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.includes('score') && (
                            <td className={`px-3 text-right text-text-primary font-semibold ${paddingClass}`}>
                              <div className="inline-flex items-center gap-2" title="Advanced Engine (0–130)">
                                <ScoreBar value={entry.score} max={130} className="bg-indigo-400" />
                                <span>{entry.score}</span>
                              </div>
                            </td>
                          )}
                          {visibleColumns.includes('scoreV2') && (
                            <td className={`px-3 text-right text-text-tertiary relative ${paddingClass}`}>
                              {entry.scoreV2 !== null && entry.scoreV2 !== undefined ? (
                                <div className="inline-block relative group/shadow">
                                  <div className="inline-flex items-center gap-2">
                                    <ScoreBar value={entry.scoreV2} max={100} className="bg-slate-400" />
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveTooltipRow((prev) => (prev === entry.id ? null : entry.id));
                                      }}
                                      className="cursor-help border-b border-dashed border-border-secondary/60 select-none hover:text-text-primary transition-colors"
                                      title="Simple V2 shadow — research only"
                                    >
                                      {entry.scoreV2}
                                    </span>
                                  </div>

                                  {/* Tooltip Overlay */}
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className={`absolute z-50 right-0 w-64 p-3 bg-bg-secondary border border-border-secondary/80 rounded-xl shadow-2xl text-left whitespace-normal pointer-events-auto transition-all ${
                                      index < 3 ? 'top-full mt-2' : 'bottom-full mb-2'
                                    } ${
                                      activeTooltipRow === entry.id
                                        ? 'block opacity-100 translate-y-0'
                                        : 'hidden md:group-hover/shadow:block md:opacity-0 md:translate-y-1 md:group-hover/shadow:opacity-100 md:group-hover/shadow:translate-y-0'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border-primary">
                                      <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Shadow Breakdown</span>
                                      <span className="text-[9px] text-text-tertiary font-mono">Simple V2 · research</span>
                                    </div>
                                    <div className="font-sans text-[11px] text-text-secondary">
                                      {renderV2Breakdown(
                                        entry.v2Breakdown as V2Breakdown | null,
                                        entry.scoreV2,
                                        expandedV2Row === entry.id,
                                        () => setExpandedV2Row((prev) => (prev === entry.id ? '' : entry.id)),
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-text-tertiary">---</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.includes('action') && (
                            <td className={`px-3 text-center ${paddingClass}`}>
                              {entry.exitCmp !== null ? (
                                <span className="text-text-tertiary text-[10px]">Closed</span>
                              ) : exitRow === entry.id ? (
                                <div
                                  className="flex flex-col items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center gap-1">
                                    <input
                                      id={`journal-exit-input-${entry.id}`}
                                      type="number"
                                      step="0.05"
                                      min="0"
                                      placeholder="₹ price"
                                      value={exitValue}
                                      onChange={(e) => { setExitValue(e.target.value); setExitError(null); }}
                                      className="w-20 h-6 px-1.5 rounded border border-border-secondary bg-bg-primary text-text-primary text-[10px] focus:outline-none focus:border-accent-blue"
                                      autoFocus
                                    />
                                    <button
                                      id={`journal-exit-confirm-${entry.id}`}
                                      onClick={() => submitExit(entry.id)}
                                      disabled={exitLoading}
                                      className="h-6 px-2 rounded bg-accent-green hover:bg-accent-green/90 text-black text-[10px] font-bold transition-colors disabled:opacity-40"
                                    >
                                      {exitLoading ? '…' : '✓'}
                                    </button>
                                    <button
                                      onClick={() => { setExitRow(null); setExitValue(''); setExitError(null); }}
                                      className="h-6 px-1.5 rounded border border-border-secondary text-text-tertiary hover:text-text-primary text-[10px] transition-colors"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  {exitError && (
                                    <p className="text-accent-red text-[9px]">{exitError}</p>
                                  )}
                                </div>
                              ) : (
                                <button
                                  id={`journal-exit-btn-${entry.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExitRow(entry.id);
                                    setExitValue('');
                                    setExitError(null);
                                  }}
                                  className="px-2 py-1 rounded border border-border-secondary text-text-secondary hover:text-text-primary hover:border-border-primary text-[10px] font-medium transition-all"
                                >
                                  Set Exit
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary font-mono">
                  <span className="text-xs text-text-secondary">
                    {total} entries · Page {page} of {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      id="journal-prev-page"
                      onClick={() => { const p = page - 1; setPage(p); fetchData(p); }}
                      disabled={page <= 1}
                      className="h-7 w-7 flex items-center justify-center rounded border border-border-secondary text-text-tertiary hover:text-text-primary hover:border-border-primary disabled:opacity-30 transition-all"
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <button
                      id="journal-next-page"
                      onClick={() => { const p = page + 1; setPage(p); fetchData(p); }}
                      disabled={page >= totalPages}
                      className="h-7 w-7 flex items-center justify-center rounded border border-border-secondary text-text-tertiary hover:text-text-primary hover:border-border-primary disabled:opacity-30 transition-all"
                    >
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>

        {/* ── Analysis Charts ──────────────────────────────────────────────── */}
        {stats && entries.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Chart 1: Win Rate by Signal Type */}
            <div className="rounded-xl border border-border-primary bg-bg-secondary p-5">
              <h2 className="text-sm font-semibold text-white mb-1">
                Win Rate by Signal Type
              </h2>
              <p className="text-[11px] text-slate-500 mb-4">
                Which signal type has the highest success rate?
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={winRateChartData} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0d0f18',
                      border: '1px solid #1e2433',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: unknown) => [`${Number(v ?? 0).toFixed(1)}%`, 'Win Rate']}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {winRateChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Avg P&L% by Exit Time */}
            <div className="rounded-xl border border-border-primary bg-bg-secondary p-5">
              <h2 className="text-sm font-semibold text-white mb-1">
                Avg P&amp;L % by Exit Time
              </h2>
              <p className="text-[11px] text-slate-500 mb-4">
                What is the best time to exit? (computed from snapshot data)
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={exitTimeChartData} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0d0f18',
                      border: '1px solid #1e2433',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: unknown) => {
                      const n = Number(v ?? 0);
                      return [`${n >= 0 ? '+' : ''}${n.toFixed(2)}%`, 'Avg P&L'];
                    }}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {exitTimeChartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.value >= 0 ? '#22c55e' : '#ef4444'}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        )}
          </>
        )}
      </div>

      {/* Trade Detail Drawer */}
      <TradeDetailDrawer
        isOpen={tradeDrawerOpen}
        onClose={() => setTradeDrawerOpen(false)}
        trade={selectedTrade}
        onInspectStock={handleInspectStock}
      />

      {/* Stock Detail Drawer */}
      <StockDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        stock={drawerStock}
      />
    </div>
  );
}
