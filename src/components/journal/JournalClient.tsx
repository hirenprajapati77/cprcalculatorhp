'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Download, RefreshCw, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Award, Activity,
} from 'lucide-react';

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
  const valid = entries.filter(e => e[field] !== null);
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
        <div className="text-[9px] text-text-tertiary mt-1 not-italic">V2 scoring runs at signal creation via overnight cron.</div>
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
        Raw Score = CLV + CPR + Liquidity. Hard Gate determines eligibility.
        If gate fails, Stored V2 Score becomes <span className="text-red-400 font-semibold">0</span>.
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
          <span className="text-slate-400 font-semibold">Stored V2 Score</span>
          <V2FinalScore score={finalScore} />
        </div>
      </div>

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

function StatWidget({
  label, value, sub, icon, color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      style={{ borderColor: `${color}30`, background: `${color}08` }}
      className="rounded-xl border p-4 flex items-start gap-3 min-w-0"
    >
      <div
        style={{ background: `${color}18`, color }}
        className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-sm"
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-0.5">
          {label}
        </p>
        <p className="text-xl font-bold text-white leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-text-tertiary mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SignalBadge({ type }: { type: string }) {
  return (
    <span
      style={{
        color: SIGNAL_COLORS[type] ?? '#94a3b8',
        background: SIGNAL_BG[type] ?? 'rgba(148,163,184,0.1)',
        border: `1px solid ${SIGNAL_COLORS[type] ?? '#94a3b8'}40`,
      }}
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase whitespace-nowrap"
    >
      {type}
    </span>
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

export default function JournalClient({ initialReportingData }: { initialReportingData?: ReportingResponse }) {
  const [activeTab, setActiveTab]     = useState<'LOG' | 'ANALYTICS' | 'SIGNALS'>('LOG');
  const [reportingData]               = useState<ReportingResponse | null>(initialReportingData || null);
  const [entries, setEntries]         = useState<JournalEntry[]>([]);
  const [stats, setStats]             = useState<JournalStats | null>(null);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [totalPages, setTotalPages]   = useState(1);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // Filters
  const [fromDate, setFromDate]       = useState('');
  const [toDate, setToDate]           = useState('');
  const [signalType, setSignalType]   = useState<'ALL' | 'CPR' | 'BTST' | 'STBT'>('ALL');
  const [qualityFilter, setQualityFilter] = useState<'ALL' | 'TRADEABLE' | 'WATCHLIST' | 'LOW_QUALITY'>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');

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
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: '50',
        signalType,
        ...(fromDate ? { fromDate } : {}),
        ...(toDate   ? { toDate   } : {}),
      });
      const res  = await fetch(`/api/journal?${params}`);
      const data: JournalResponse = await res.json();
      if (!data.success) throw new Error('API returned error');
      
      let filteredEntries = data.entries;
      if (qualityFilter !== 'ALL') {
         filteredEntries = filteredEntries.filter(e => e.qualityBucketAtSignal === qualityFilter);
      }
      if (outcomeFilter !== 'ALL') {
         filteredEntries = filteredEntries.filter(e => e.executionOutcome === outcomeFilter);
      }
      
      setEntries(filteredEntries);
      setStats(data.stats);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load journal');
    } finally {
      setLoading(false);
    }
  }, [signalType, fromDate, toDate, qualityFilter, outcomeFilter]);

  useEffect(() => { fetchData(1); }, [fetchData]);

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
      '9:16 AM','9:30 AM','9:45 AM','10:00 AM','Exit CMP','P&L%','V1 Score','V2 Score',
      'Quality Bucket', 'Execution Outcome', 'Event Risk', 'Regime Snapshot', 'Regime Parsed'
    ];
    const rows = entries.map(e => {
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
        e.cmp1000 ?? '',
        e.exitCmp ?? '',
        e.pnlPct  !== null ? e.pnlPct.toFixed(2) : '',
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
    { name: '10:00 AM', value: computeAvgAtTime(entries, 'cmp1000') },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg-primary text-white">
      <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-6">

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Trade Journal
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Live option trade tracking — CPR · BTST · STBT signals
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-bg-secondary p-1 rounded-lg border border-border-primary mr-4">
              <button
                onClick={() => setActiveTab('LOG')}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'LOG' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-bg-primary/50'
                }`}
              >
                Trade Log
              </button>
              <button
                onClick={() => setActiveTab('ANALYTICS')}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'ANALYTICS' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-bg-primary/50'
                }`}
              >
                Analytics
              </button>
              <button
                id="journal-signals-tab-btn"
                onClick={() => setActiveTab('SIGNALS')}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'SIGNALS' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-bg-primary/50'
                }`}
              >
                Signals
              </button>
            </div>
            
            <button
              id="journal-refresh-btn"
              onClick={() => fetchData(1)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-secondary text-text-secondary hover:text-text-primary hover:border-border-tertiary text-xs font-medium transition-all disabled:opacity-40"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              id="journal-export-btn"
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-secondary text-text-secondary hover:text-text-primary hover:border-border-tertiary text-xs font-medium transition-all"
            >
              <Download size={12} />
              Export CSV
            </button>
          </div>
        </div>

        {activeTab === 'ANALYTICS' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ── No-data empty state ── */}
            {(!reportingData || (reportingData.qualityBuckets.length === 0 && reportingData.executionOutcomes.length === 0)) && (
              <div className="rounded-xl border border-border-primary bg-bg-secondary p-12 text-center">
                <div className="text-4xl mb-3">📊</div>
                <div className="text-slate-400 font-semibold mb-1">Not enough completed trades to generate analytics.</div>
                <div className="text-slate-600 text-xs">Close at least 5 trades to unlock strategy insights.</div>
              </div>
            )}

            {reportingData && (
              <>
                {/* ── 1. KPI Cards ── */}
                {(() => {
                  const closed = reportingData.qualityBuckets.reduce((s, b) => s + b.count, 0);
                  const wins   = reportingData.executionOutcomes.find(b => b.groupValue === 'MODEL_VALID')?.count ?? 0;
                  const wr     = closed > 0 ? (wins / closed) * 100 : 0;
                  const avgPnl = reportingData.qualityBuckets.reduce((s, b) => s + b.avgPnlPct * b.count, 0) / (closed || 1);
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

                {/* ── 7. Execution Variance Card ── */}
                <div className="rounded-xl border border-border-primary/50 bg-bg-secondary p-4 flex items-start gap-4">
                  <div style={{ background: (reportingData.variance.averageVariancePct >= -2 ? '#22c55e' : '#ef4444') + '18', color: reportingData.variance.averageVariancePct >= -2 ? '#22c55e' : '#ef4444' }}
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 text-lg">
                    <Activity size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Execution Variance</div>
                    <div style={{ color: reportingData.variance.averageVariancePct >= -2 ? '#22c55e' : '#ef4444' }}
                      className="text-2xl font-bold font-mono">
                      {reportingData.variance.averageVariancePct >= 0 ? '+' : ''}{reportingData.variance.averageVariancePct.toFixed(2)}%
                    </div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">
                      Average gap between model prediction and actual return · {reportingData.variance.sampleSize} trades sampled
                    </div>
                    <div className="mt-2 text-[10px]" style={{ color: reportingData.variance.averageVariancePct >= -2 ? '#22c55e' : '#ef4444' }}>
                      {reportingData.variance.averageVariancePct >= -2
                        ? '● Execution quality is within acceptable range'
                        : '● Execution slippage is hurting returns — review option selection'}
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
                          const isKgs    = s.signal.startsWith('KGS_');
                          return (
                            <tr key={s.signal} className="hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-2.5">
                                <span
                                  style={isKgs ? { color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)' } : {}}
                                  className={`font-mono text-[11px] font-semibold ${isKgs ? 'px-1.5 py-0.5 rounded' : 'text-slate-300'}`}
                                >
                                  {s.signal}
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

        {activeTab === 'LOG' && (
          <>
            {/* ── Stat Widgets ─────────────────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatWidget
              label="Total Trades"
              value={String(stats.totalAllTrades ?? stats.totalTrades)}
              sub={`${stats.winners} winners`}
              icon={<Activity size={16} />}
              color="#3b82f6"
            />
            <StatWidget
              label="Win Rate"
              value={`${stats.winRate}%`}
              sub={`${stats.totalClosedTrades ?? stats.totalTrades} closed trades`}
              icon={<TrendingUp size={16} />}
              color={stats.winRate >= 50 ? '#22c55e' : '#ef4444'}
            />
            <StatWidget
              label="Avg P&L %"
              value={`${stats.avgPnlPct >= 0 ? '+' : ''}${stats.avgPnlPct}%`}
              sub="per closed trade"
              icon={stats.avgPnlPct >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              color={stats.avgPnlPct >= 0 ? '#22c55e' : '#ef4444'}
            />
            <StatWidget
              label="Best Signal"
              value={stats.bestSignalType ?? '---'}
              sub={stats.bestSignalType ? `${stats.byType[stats.bestSignalType].winRate}% win rate` : 'Not enough data'}
              icon={<Award size={16} />}
              color={stats.bestSignalType ? SIGNAL_COLORS[stats.bestSignalType] : '#64748b'}
            />
          </div>
        )}

        {/* ── Filter Bar ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-border-primary bg-bg-secondary">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary font-medium">From</label>
            <input
              id="journal-from-date"
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setPage(1); }}
              className="h-8 px-2.5 py-1.5 rounded-lg border border-border-secondary bg-bg-primary text-text-primary text-[11px] focus:outline-none focus:border-accent-blue"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary font-medium">To</label>
            <input
              id="journal-to-date"
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setPage(1); }}
              className="h-8 px-2.5 py-1.5 rounded-lg border border-border-secondary bg-bg-primary text-text-primary text-[11px] focus:outline-none focus:border-accent-blue"
            />
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {(['ALL', 'CPR', 'BTST', 'STBT'] as const).map(t => (
              <button
                key={t}
                id={`journal-filter-${t.toLowerCase()}`}
                onClick={() => { setSignalType(t); setPage(1); }}
                style={signalType === t && t !== 'ALL' ? {
                  color: SIGNAL_COLORS[t],
                  background: SIGNAL_BG[t],
                  borderColor: `${SIGNAL_COLORS[t]}40`,
                } : {}}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  signalType === t
                    ? t === 'ALL'
                      ? 'bg-white/10 text-white border-border-secondary'
                      : 'border-current'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-white/5'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-2 border-l border-border-secondary pl-3 ml-1">
            <select
              value={qualityFilter}
              onChange={e => { setQualityFilter(e.target.value as 'ALL' | 'TRADEABLE' | 'WATCHLIST' | 'LOW_QUALITY'); setPage(1); }}
              className="h-8 px-2.5 py-1.5 rounded-lg border border-border-secondary bg-bg-primary text-text-secondary text-[11px] focus:outline-none focus:border-accent-blue"
            >
              <option value="ALL">All Qualities</option>
              <option value="TRADEABLE">Tradeable</option>
              <option value="WATCHLIST">Watchlist</option>
              <option value="LOW_QUALITY">Low Quality</option>
            </select>
            
            <select
              value={outcomeFilter}
              onChange={e => { setOutcomeFilter(e.target.value); setPage(1); }}
              className="h-8 px-2.5 py-1.5 rounded-lg border border-border-secondary bg-bg-primary text-text-secondary text-[11px] focus:outline-none focus:border-accent-blue w-[140px]"
            >
              <option value="ALL">All Outcomes</option>
              <option value="MODEL_VALID">Model Valid</option>
              <option value="EXECUTION_SLIPPAGE">Exec Slippage</option>
              <option value="GAP_FAILURE">Gap Failure</option>
              <option value="EVENT_RISK_AVOIDABLE">Event Risk</option>
              <option value="MODEL_WEAK">Model Weak</option>
              <option value="LOW_QUALITY_SHOULD_SKIP">Low Quality Skip</option>
            </select>
          </div>
          
          {(fromDate || toDate || signalType !== 'ALL' || qualityFilter !== 'ALL' || outcomeFilter !== 'ALL') && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); setSignalType('ALL'); setQualityFilter('ALL'); setOutcomeFilter('ALL'); setPage(1); }}
              className="text-xs text-slate-600 hover:text-slate-400 underline transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border-primary bg-bg-secondary overflow-hidden">
          {error && (
            <div className="p-6 text-center text-red-400 text-sm">{error}</div>
          )}
          {loading && entries.length === 0 && (
            <div className="p-10 text-center text-slate-600 text-sm animate-pulse">
              Loading journal entries…
            </div>
          )}
          {!error && !loading && entries.length === 0 && (
            <div className="p-10 text-center text-slate-600 text-sm">
              No journal entries yet. Entries will appear after 3:20 PM IST on trading days.
            </div>
          )}
          {entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border-primary text-text-secondary uppercase tracking-wider text-[10px]">
                    <th className="text-left px-4 py-3 font-semibold">Trade Date</th>
                    <th className="text-left px-3 py-3 font-semibold">Type</th>
                    <th className="text-left px-3 py-3 font-semibold">Stock</th>
                    <th className="text-left px-3 py-3 font-semibold">Option</th>
                    <th className="text-right px-3 py-3 font-semibold">Entry CMP</th>
                    <th className="text-right px-3 py-3 font-semibold">9:16 AM</th>
                    <th className="text-right px-3 py-3 font-semibold">9:30 AM</th>
                    <th className="text-right px-3 py-3 font-semibold">9:45 AM</th>
                    <th className="text-right px-3 py-3 font-semibold">10:00 AM</th>
                    <th className="text-right px-3 py-3 font-semibold">Exit CMP</th>
                    <th className="text-right px-3 py-3 font-semibold">P&amp;L %</th>
                    <th className="text-right px-3 py-3 font-semibold">V1 Score</th>
                    <th className="text-right px-3 py-3 font-semibold">V2 Score</th>
                    <th className="text-center px-3 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary/60">
                  {entries.map((entry, index) => (
                    <tr
                      key={entry.id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {fmtDate(entry.tradeDate)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <SignalBadge type={entry.signalType} />
                          {entry.qualityBucketAtSignal && (
                            <span className="text-[9px] text-slate-500 border border-border-secondary rounded-lg px-1 whitespace-nowrap">{entry.qualityBucketAtSignal}</span>
                          )}
                          <OutcomeBadge outcome={entry.executionOutcome} />
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-white font-mono">
                        {entry.symbol}
                      </td>
                      <td className="px-3 py-3 text-slate-400 font-mono whitespace-nowrap">
                        {entry.optionContract}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-300 font-mono">
                        ₹{fmt(entry.entryCmp)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <SnapshotCell value={entry.cmp916} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <SnapshotCell value={entry.cmp930} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <SnapshotCell value={entry.cmp945} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <SnapshotCell value={entry.cmp1000} />
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {entry.exitCmp !== null
                          ? <span className="text-slate-300">₹{fmt(entry.exitCmp)}</span>
                          : <span className="text-slate-600">---</span>
                        }
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold">
                        {entry.pnlPct !== null ? (
                          <span style={{ color: pnlColor(entry.pnlPct) }}>
                            {entry.pnlPct >= 0 ? '+' : ''}{fmt(entry.pnlPct)}%
                          </span>
                        ) : (
                          <span className="text-slate-600">---</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-300">
                        {entry.score}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-slate-400 relative">
                        {entry.scoreV2 !== null && entry.scoreV2 !== undefined ? (
                          <div className="inline-block relative group">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTooltipRow(prev => prev === entry.id ? null : entry.id);
                              }}
                              className="cursor-help border-b border-dashed border-border-secondary select-none hover:text-white transition-colors"
                            >
                              {entry.scoreV2}
                            </span>

                            {/* Premium Tooltip Overlay */}
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute z-50 right-0 w-64 p-3 bg-bg-secondary border border-border-secondary/80 rounded-xl shadow-2xl text-left whitespace-normal pointer-events-auto transition-all ${
                                index < 3 ? 'top-full mt-2' : 'bottom-full mb-2'
                              } ${
                                activeTooltipRow === entry.id ? 'block opacity-100 translate-y-0' : 'hidden md:group-hover:block md:opacity-0 md:translate-y-1 md:group-hover:opacity-100 md:group-hover:translate-y-0'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border-primary">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">V2 Score Breakdown</span>
                                <span className="text-[9px] text-slate-600 font-mono">Shadow Mode</span>
                              </div>
                              <div className="font-sans text-[11px] text-slate-300">
                                {renderV2Breakdown(
                                  entry.v2Breakdown as V2Breakdown | null,
                                  entry.scoreV2,
                                  expandedV2Row === entry.id,
                                  () => setExpandedV2Row(prev => prev === entry.id ? '' : entry.id),
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">---</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {entry.exitCmp !== null ? (
                          <span className="text-slate-600 text-[10px]">Closed</span>
                        ) : exitRow === entry.id ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1">
                              <input
                                id={`journal-exit-input-${entry.id}`}
                                type="number"
                                step="0.05"
                                min="0"
                                placeholder="₹ price"
                                value={exitValue}
                                onChange={e => { setExitValue(e.target.value); setExitError(null); }}
                                className="w-20 h-6 px-1.5 rounded border border-border-secondary bg-bg-primary text-slate-300 text-[10px] focus:outline-none focus:border-blue-500/50"
                                autoFocus
                              />
                              <button
                                id={`journal-exit-confirm-${entry.id}`}
                                onClick={() => submitExit(entry.id)}
                                disabled={exitLoading}
                                className="h-6 px-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-[10px] font-semibold transition-colors disabled:opacity-40"
                              >
                                {exitLoading ? '…' : '✓'}
                              </button>
                              <button
                                onClick={() => { setExitRow(null); setExitValue(''); setExitError(null); }}
                                className="h-6 px-1.5 rounded border border-border-secondary text-slate-500 hover:text-white text-[10px] transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                            {exitError && (
                              <p className="text-red-400 text-[9px]">{exitError}</p>
                            )}
                          </div>
                        ) : (
                          <button
                            id={`journal-exit-btn-${entry.id}`}
                            onClick={() => { setExitRow(entry.id); setExitValue(''); setExitError(null); }}
                            className="px-2 py-1 rounded border border-border-secondary text-text-secondary hover:text-text-primary hover:border-border-secondary text-[10px] font-medium transition-all"
                          >
                            Set Exit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border-primary">
              <span className="text-xs text-text-secondary">
                {total} entries · Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  id="journal-prev-page"
                  onClick={() => { const p = page - 1; setPage(p); fetchData(p); }}
                  disabled={page <= 1}
                  className="h-7 w-7 flex items-center justify-center rounded border border-border-secondary text-slate-500 hover:text-white hover:border-border-secondary disabled:opacity-30 transition-all"
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  id="journal-next-page"
                  onClick={() => { const p = page + 1; setPage(p); fetchData(p); }}
                  disabled={page >= totalPages}
                  className="h-7 w-7 flex items-center justify-center rounded border border-border-secondary text-slate-500 hover:text-white hover:border-border-secondary disabled:opacity-30 transition-all"
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
    </div>
  );
}
