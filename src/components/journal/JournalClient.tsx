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
}

interface JournalStats {
  totalTrades: number;
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
        {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
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
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase"
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function JournalClient() {
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

  // Inline exit input state per row
  const [exitRow, setExitRow]         = useState<string | null>(null);
  const [exitValue, setExitValue]     = useState('');
  const [exitLoading, setExitLoading] = useState(false);
  const [exitError, setExitError]     = useState<string | null>(null);

  // Tooltip State for V2 Score breakdown on mobile
  const [activeTooltipRow, setActiveTooltipRow] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTooltipRow) return;
    const handleOutsideClick = () => {
      setActiveTooltipRow(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [activeTooltipRow]);

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
  }, [signalType, fromDate, toDate]);

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
    ];
    const rows = entries.map(e => [
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
    ]);
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
    <div className="min-h-screen bg-[#08090c] text-white">
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
            <button
              id="journal-refresh-btn"
              onClick={() => fetchData(1)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 text-xs font-medium transition-all disabled:opacity-40"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              id="journal-export-btn"
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 text-xs font-medium transition-all"
            >
              <Download size={12} />
              Export CSV
            </button>
          </div>
        </div>

        {/* ── Stat Widgets ─────────────────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatWidget
              label="Total Trades"
              value={String(stats.totalTrades)}
              sub={`${stats.winners} winners`}
              icon={<Activity size={16} />}
              color="#3b82f6"
            />
            <StatWidget
              label="Win Rate"
              value={`${stats.winRate}%`}
              sub={`${stats.totalTrades} closed trades`}
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
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border border-slate-800 bg-[#0d0f18]">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium">From</label>
            <input
              id="journal-from-date"
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setPage(1); }}
              className="h-8 px-2 rounded-lg border border-slate-700 bg-[#08090c] text-slate-300 text-xs focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium">To</label>
            <input
              id="journal-to-date"
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setPage(1); }}
              className="h-8 px-2 rounded-lg border border-slate-700 bg-[#08090c] text-slate-300 text-xs focus:outline-none focus:border-blue-500/50"
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
                      ? 'bg-white/10 text-white border-slate-600'
                      : 'border-current'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {(fromDate || toDate || signalType !== 'ALL') && (
            <button
              onClick={() => { setFromDate(''); setToDate(''); setSignalType('ALL'); setPage(1); }}
              className="text-xs text-slate-600 hover:text-slate-400 underline transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-800 bg-[#0d0f18] overflow-hidden">
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
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
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
                <tbody className="divide-y divide-slate-800/60">
                  {entries.map(entry => (
                    <tr
                      key={entry.id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {fmtDate(entry.tradeDate)}
                      </td>
                      <td className="px-3 py-3">
                        <SignalBadge type={entry.signalType} />
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
                              className="cursor-help border-b border-dashed border-slate-600 select-none hover:text-white transition-colors"
                            >
                              {entry.scoreV2}
                            </span>

                            {/* Premium Tooltip Overlay */}
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute z-50 right-0 bottom-full mb-2 w-52 p-3 bg-[#0d0f18] border border-slate-700/80 rounded-lg shadow-xl text-left pointer-events-auto transition-all ${
                                activeTooltipRow === entry.id ? 'block opacity-100 translate-y-0' : 'hidden md:group-hover:block md:opacity-0 md:translate-y-1 md:group-hover:opacity-100 md:group-hover:translate-y-0'
                              }`}
                            >
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 pb-1 border-b border-slate-800">
                                V2 Score Breakdown
                              </div>
                              <div className="space-y-1.5 font-sans text-[11px] text-slate-300">
                                {entry.v2Breakdown && typeof entry.v2Breakdown === 'object' ? (
                                  Object.entries(entry.v2Breakdown).map(([k, v]) => (
                                    <div key={k} className="flex justify-between items-center">
                                      <span className="capitalize text-slate-500 font-medium">{k.replace(/([A-Z])/g, ' $1')}</span>
                                      <span className="font-mono text-white font-semibold">+{String(v)}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-slate-500 italic">No breakdown details</div>
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
                                className="w-20 h-6 px-1.5 rounded border border-slate-700 bg-[#08090c] text-slate-300 text-[10px] focus:outline-none focus:border-blue-500/50"
                                autoFocus
                              />
                              <button
                                id={`journal-exit-confirm-${entry.id}`}
                                onClick={() => submitExit(entry.id)}
                                disabled={exitLoading}
                                className="h-6 px-2 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white text-[10px] font-semibold transition-colors disabled:opacity-40"
                              >
                                {exitLoading ? '…' : '✓'}
                              </button>
                              <button
                                onClick={() => { setExitRow(null); setExitValue(''); setExitError(null); }}
                                className="h-6 px-1.5 rounded border border-slate-700 text-slate-500 hover:text-white text-[10px] transition-colors"
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
                            className="px-2 py-1 rounded border border-slate-700 text-slate-500 hover:text-white hover:border-slate-500 text-[10px] font-medium transition-all"
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
              <span className="text-xs text-slate-500">
                {total} entries · Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  id="journal-prev-page"
                  onClick={() => { const p = page - 1; setPage(p); fetchData(p); }}
                  disabled={page <= 1}
                  className="h-7 w-7 flex items-center justify-center rounded border border-slate-700 text-slate-500 hover:text-white hover:border-slate-600 disabled:opacity-30 transition-all"
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  id="journal-next-page"
                  onClick={() => { const p = page + 1; setPage(p); fetchData(p); }}
                  disabled={page >= totalPages}
                  className="h-7 w-7 flex items-center justify-center rounded border border-slate-700 text-slate-500 hover:text-white hover:border-slate-600 disabled:opacity-30 transition-all"
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
            <div className="rounded-xl border border-slate-800 bg-[#0d0f18] p-5">
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
            <div className="rounded-xl border border-slate-800 bg-[#0d0f18] p-5">
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

      </div>
    </div>
  );
}
