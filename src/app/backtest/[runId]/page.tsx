'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart2,
  List,
  FileText,
  Database,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Percent,
  Layers,
  Scale,
  Activity,
  Search,
  Code2,
  Copy,
  Check,
} from 'lucide-react';
import { formatIST, fmt } from '@/utils/format';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import IndexBtstSlicePanel from '@/components/backtest/IndexBtstSlicePanel';
import StockBtstSlicePanel from '@/components/backtest/StockBtstSlicePanel';

interface BacktestTrade {
  id: string;
  symbol: string;
  type: string;
  signal: string;
  entryDate: string;
  entryPrice?: number | null;
  exitDate?: string | null;
  exitPrice?: number | null;
  pnl: number | null;
  pnlPercent: number | null;
  durationDays: number;
  status: string;
}

export default function RunDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params?.runId as string;

  const [activeTab, setActiveTab] = useState<'summary' | 'trades' | 'index-btst' | 'stock-btst' | 'metrics' | 'snapshots'>('summary');
  const [tradePage, setTradePage] = useState(1);
  const [tradeSearch, setTradeSearch] = useState('');
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const [copiedMetrics, setCopiedMetrics] = useState(false);
  const tradeLimit = 50;

  // 1. Fetch Summary & Metrics
  const { data: runData, isLoading: isLoadingRun } = useQuery({
    queryKey: ['backtestRun', runId],
    queryFn: async () => {
      const res = await fetch(`/api/backtest?runId=${runId}`);
      if (!res.ok) throw new Error('Failed to fetch run data');
      return res.json();
    },
  });

  // 2. Fetch Paginated Trades
  const { data: tradesData, isLoading: isLoadingTrades } = useQuery({
    queryKey: ['backtestTrades', runId, tradePage],
    queryFn: async () => {
      const res = await fetch(`/api/backtest/${runId}/trades?page=${tradePage}&limit=${tradeLimit}`);
      if (!res.ok) throw new Error('Failed to fetch trades');
      return res.json() as Promise<{
        trades: BacktestTrade[];
        page: number;
        totalPages: number;
        total: number;
      }>;
    },
    enabled: activeTab === 'trades',
  });

  // 3. Fetch Snapshots
  const { data: snapshotsData, isLoading: isLoadingSnapshots } = useQuery({
    queryKey: ['backtestSnapshots', runId],
    queryFn: async () => {
      const res = await fetch(`/api/backtest/${runId}/snapshots`);
      if (!res.ok) throw new Error('Failed to fetch snapshots');
      return res.json() as Promise<Array<{ id: string; period: string; metricType: string; metricValue: number }>>;
    },
    enabled: activeTab === 'snapshots',
  });

  const metrics = runData?.metrics;

  const handleCopyMetrics = () => {
    if (metrics) {
      navigator.clipboard.writeText(JSON.stringify(metrics, null, 2));
      setCopiedMetrics(true);
      setTimeout(() => setCopiedMetrics(false), 2000);
    }
  };

  const tabs: Array<{ id: typeof activeTab; label: string; icon: React.FC<{ size?: number; className?: string }> }> = [
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'trades', label: 'Trade Ledger', icon: List },
    { id: 'index-btst', label: 'Index BTST', icon: BarChart2 },
    { id: 'stock-btst', label: 'Stock BTST', icon: BarChart2 },
    { id: 'metrics', label: 'Raw Metrics', icon: Code2 },
    { id: 'snapshots', label: 'Snapshots', icon: Database },
  ];

  // Filter trades client-side on current page
  const filteredTrades = (tradesData?.trades || []).filter((t) => {
    if (!tradeSearch) return true;
    const term = tradeSearch.toLowerCase();
    return (
      t.symbol.toLowerCase().includes(term) ||
      (t.signal && t.signal.toLowerCase().includes(term)) ||
      (t.type && t.type.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-4 font-mono select-none">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/backtest')}
            className="p-1.5 hover:bg-bg-tertiary rounded-md transition-colors text-text-tertiary hover:text-text-primary border border-border-primary"
            title="Return to Backtest Terminal"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-text-primary tracking-tight">
                Backtest Run Details
              </h1>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                runData?.status?.toLowerCase() === 'completed'
                  ? 'bg-accent-green/10 text-accent-green border border-accent-green/20'
                  : 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
              }`}>
                {runData?.status || 'UNKNOWN'}
              </span>
            </div>
            <div className="text-[11px] text-text-tertiary mt-0.5">
              Run ID: <span className="text-text-secondary select-all">{runId}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/analytics/${runId}`}
            className="inline-flex items-center gap-1.5 bg-accent-blue hover:bg-accent-blue/90 text-white px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors"
          >
            <BarChart2 size={13} />
            View Visual Analytics
          </Link>
        </div>
      </div>

      {/* ── Execution KPI Strip (Authoritative FACTS) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {/* Total Trades */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <Layers size={11} className="text-accent-blue" />
              Trades
            </span>
            <span className="text-[8px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">FACT</span>
          </div>
          <div className="text-xl font-bold text-text-primary mt-1">
            {metrics?.totalTrades ?? (runData?._count?.trades ?? '—')}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Total Executed</div>
        </div>

        {/* Win Rate */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <Percent size={11} className="text-accent-green" />
              Win Rate
            </span>
            <span className="text-[8px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">FACT</span>
          </div>
          <div className={`text-xl font-bold mt-1 ${
            metrics?.winRate && metrics.winRate >= 50 ? 'text-accent-green' : 'text-accent-red'
          }`}>
            {metrics?.winRate != null ? `${Number(metrics.winRate).toFixed(1)}%` : '—'}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Decisive Trades</div>
        </div>

        {/* Profit Factor */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <Scale size={11} className="text-accent-blue" />
              Profit Factor
            </span>
            <span className="text-[8px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">FACT</span>
          </div>
          <div className="text-xl font-bold text-text-primary mt-1">
            {metrics?.profitFactor != null ? fmt(metrics.profitFactor) : '—'}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Gross Win / Gross Loss</div>
        </div>

        {/* Expectancy */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <TrendingUp size={11} className="text-accent-green" />
              Expectancy
            </span>
            <span className="text-[8px] bg-accent-green/10 text-accent-green font-bold px-1 rounded">FACT</span>
          </div>
          <div className={`text-xl font-bold mt-1 ${
            metrics?.expectancy && metrics.expectancy >= 0 ? 'text-accent-green' : 'text-accent-red'
          }`}>
            {metrics?.expectancy != null ? fmt(metrics.expectancy) : '—'}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Avg R Return / Trade</div>
        </div>

        {/* Max Drawdown */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <Activity size={11} className="text-accent-red" />
              Max DD
            </span>
            <span className="text-[8px] bg-accent-red/10 text-accent-red font-bold px-1 rounded">FACT</span>
          </div>
          <div className="text-xl font-bold text-accent-red mt-1">
            {metrics?.maxDrawdown != null ? `${Number(metrics.maxDrawdown).toFixed(1)}%` : '—'}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Peak-to-Trough</div>
        </div>

        {/* Sharpe Ratio */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <Activity size={11} className="text-text-secondary" />
              Sharpe
            </span>
            <span className="text-[8px] bg-accent-blue/10 text-accent-blue font-bold px-1 rounded">FACT</span>
          </div>
          <div className="text-xl font-bold text-text-primary mt-1">
            {metrics?.sharpe != null ? fmt(metrics.sharpe) : '—'}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Annualized Ratio</div>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex items-center gap-1 border-b border-border-primary overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
                isActive
                  ? 'border-accent-blue text-accent-blue bg-accent-blue/5'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
              }`}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Content Viewport ── */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-4">
        {/* Tab 1: Execution Summary */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border-primary">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Execution Configuration &amp; Parameters
              </span>
              <span className="text-[10px] text-text-tertiary">Run Context</span>
            </div>

            {isLoadingRun ? (
              <p className="text-xs text-text-tertiary">Loading configuration...</p>
            ) : runData ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-bg-tertiary p-3 rounded-md border border-border-primary space-y-1">
                  <div className="text-[10px] text-text-tertiary uppercase">Universe</div>
                  <div className="font-bold text-text-primary">{runData.universe}</div>
                </div>
                <div className="bg-bg-tertiary p-3 rounded-md border border-border-primary space-y-1">
                  <div className="text-[10px] text-text-tertiary uppercase">Initial Capital</div>
                  <div className="font-bold text-text-primary">₹{Number(runData.capital).toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-bg-tertiary p-3 rounded-md border border-border-primary space-y-1">
                  <div className="text-[10px] text-text-tertiary uppercase">Testing Period</div>
                  <div className="font-bold text-text-primary">
                    {formatIST(runData.startDate, { dateOnly: true })} &ndash; {formatIST(runData.endDate, { dateOnly: true })}
                  </div>
                </div>
                <div className="bg-bg-tertiary p-3 rounded-md border border-border-primary space-y-1">
                  <div className="text-[10px] text-text-tertiary uppercase">Strategy Mode</div>
                  <div className="font-bold text-accent-blue">{runData.strategyMode ?? 'LEGACY_NARROW_CPR'}</div>
                </div>
                <div className="bg-bg-tertiary p-3 rounded-md border border-border-primary space-y-1">
                  <div className="text-[10px] text-text-tertiary uppercase">Risk Model</div>
                  <div className="font-bold text-text-primary">{runData.riskModel} ({runData.riskValue}%)</div>
                </div>
                <div className="bg-bg-tertiary p-3 rounded-md border border-border-primary space-y-1">
                  <div className="text-[10px] text-text-tertiary uppercase">Exit Strategy</div>
                  <div className="font-bold text-text-primary">{runData.exitStrategy}</div>
                </div>
                <div className="bg-bg-tertiary p-3 rounded-md border border-border-primary space-y-1">
                  <div className="text-[10px] text-text-tertiary uppercase">Execution Mode</div>
                  <div className="font-bold text-text-primary">{runData.executionMode}</div>
                </div>
                <div className="bg-bg-tertiary p-3 rounded-md border border-border-primary space-y-1">
                  <div className="text-[10px] text-text-tertiary uppercase">Run Creation</div>
                  <div className="font-bold text-text-secondary">{formatIST(runData.createdAt)}</div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-accent-red">Failed to load run details.</p>
            )}
          </div>
        )}

        {/* Tab 2: Trade Ledger (Enterprise Table) */}
        {activeTab === 'trades' && (
          <div className="space-y-3">
            {/* Table Filter & Density Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-border-primary">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                  Trade Ledger
                </span>
                <span className="text-[10px] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded">
                  {tradesData?.total ?? 0} Total Trades
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="Search symbol / signal..."
                    value={tradeSearch}
                    onChange={(e) => setTradeSearch(e.target.value)}
                    className="bg-bg-tertiary border border-border-primary rounded px-2.5 py-1 pl-7 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue w-40 sm:w-56"
                  />
                </div>

                <div className="flex items-center border border-border-primary rounded overflow-hidden text-[10px]">
                  <button
                    type="button"
                    onClick={() => setDensity('compact')}
                    className={`px-2 py-0.5 transition-colors ${
                      density === 'compact' ? 'bg-accent-blue text-white font-bold' : 'bg-bg-tertiary text-text-secondary'
                    }`}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => setDensity('comfortable')}
                    className={`px-2 py-0.5 transition-colors ${
                      density === 'comfortable' ? 'bg-accent-blue text-white font-bold' : 'bg-bg-tertiary text-text-secondary'
                    }`}
                  >
                    Detailed
                  </button>
                </div>
              </div>
            </div>

            {/* Table Area */}
            {isLoadingTrades ? (
              <div className="py-12 text-center text-xs text-text-tertiary">
                Loading trade ledger...
              </div>
            ) : filteredTrades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left whitespace-nowrap font-mono">
                  <thead className="sticky top-0 bg-bg-tertiary text-text-secondary text-[10px] uppercase tracking-wider border-b border-border-primary">
                    <tr>
                      <th className="sticky left-0 bg-bg-tertiary py-2 px-3 font-semibold">Stock</th>
                      <th className="py-2 px-3 font-semibold">Type</th>
                      <th className="py-2 px-3 font-semibold">Signal</th>
                      <th className="py-2 px-3 font-semibold">Entry Date</th>
                      <th className="py-2 px-3 font-semibold text-right">Entry ₹</th>
                      <th className="py-2 px-3 font-semibold">Exit Date</th>
                      <th className="py-2 px-3 font-semibold text-right">Exit ₹</th>
                      <th className="py-2 px-3 font-semibold text-right">
                        Gross P&amp;L <span className="text-[8px] text-accent-green font-bold">FACT</span>
                      </th>
                      <th className="py-2 px-3 font-semibold text-right">Return %</th>
                      <th className="py-2 px-3 font-semibold text-center">Duration</th>
                      <th className="py-2 px-3 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-primary/40">
                    {filteredTrades.map((t) => {
                      const isProfit = (t.pnl ?? 0) > 0;
                      const isLoss = (t.pnl ?? 0) < 0;
                      const pnlColor = isProfit ? 'text-accent-green font-bold' : isLoss ? 'text-accent-red font-bold' : 'text-text-tertiary';
                      const rowPad = density === 'compact' ? 'py-1.5 px-3' : 'py-2.5 px-3';

                      return (
                        <tr key={t.id} className="hover:bg-bg-tertiary/40 transition-colors">
                          <td className={`sticky left-0 bg-bg-secondary hover:bg-bg-tertiary/40 font-bold text-text-primary ${rowPad}`}>
                            {t.symbol}
                          </td>
                          <td className={rowPad}>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.type === 'BUY' || t.type === 'LONG'
                                ? 'bg-accent-green/10 text-accent-green'
                                : 'bg-accent-red/10 text-accent-red'
                            }`}>
                              {t.type}
                            </span>
                          </td>
                          <td className={`${rowPad} max-w-[160px] truncate text-text-secondary`} title={t.signal}>
                            {t.signal}
                          </td>
                          <td className={`${rowPad} text-text-tertiary text-[11px]`}>
                            {formatIST(t.entryDate, { dateOnly: true })}
                          </td>
                          <td className={`${rowPad} text-right font-mono text-text-primary`}>
                            {t.entryPrice != null ? fmt(t.entryPrice) : '—'}
                          </td>
                          <td className={`${rowPad} text-text-tertiary text-[11px]`}>
                            {t.exitDate ? formatIST(t.exitDate, { dateOnly: true }) : '—'}
                          </td>
                          <td className={`${rowPad} text-right font-mono text-text-primary`}>
                            {t.exitPrice != null ? fmt(t.exitPrice) : '—'}
                          </td>
                          <td className={`${rowPad} text-right font-mono ${pnlColor}`}>
                            {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}₹${fmt(t.pnl)}` : '—'}
                          </td>
                          <td className={`${rowPad} text-right font-mono ${pnlColor}`}>
                            {t.pnlPercent != null ? `${t.pnlPercent >= 0 ? '+' : ''}${fmt(t.pnlPercent)}%` : '—'}
                          </td>
                          <td className={`${rowPad} text-center text-text-secondary`}>
                            {t.durationDays}d
                          </td>
                          <td className={`${rowPad} text-center`}>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-tertiary uppercase">
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-text-tertiary">
                No trades matched your search criteria.
              </div>
            )}

            {/* Pagination Controls */}
            {tradesData && tradesData.totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-border-primary/60 text-xs text-text-secondary">
                <div>
                  Page <span className="font-bold text-text-primary">{tradesData.page}</span> of{' '}
                  <span className="font-bold text-text-primary">{tradesData.totalPages}</span> ({tradesData.total} trades)
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={tradePage <= 1}
                    onClick={() => setTradePage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={tradePage >= tradesData.totalPages}
                    onClick={() => setTradePage((p) => p + 1)}
                    className="p-1.5 rounded bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Index BTST */}
        {activeTab === 'index-btst' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border-primary">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Index BTST &ndash; VIX Band &amp; Regime Breakdown
              </span>
            </div>
            <IndexBtstSlicePanel runId={runId} />
          </div>
        )}

        {/* Tab 4: Stock BTST */}
        {activeTab === 'stock-btst' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border-primary">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Stock BTST &ndash; Regime, VDU &amp; Confluence Slices
              </span>
            </div>
            <StockBtstSlicePanel runId={runId} />
          </div>
        )}

        {/* Tab 5: Raw Metrics Payload */}
        {activeTab === 'metrics' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border-primary">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Engine Metrics Payload
              </span>
              <button
                type="button"
                onClick={handleCopyMetrics}
                className="text-xs text-text-tertiary hover:text-text-primary flex items-center gap-1 px-2 py-0.5 rounded bg-bg-tertiary border border-border-primary transition-colors"
              >
                {copiedMetrics ? <Check size={12} className="text-accent-green" /> : <Copy size={12} />}
                {copiedMetrics ? 'Copied' : 'Copy JSON'}
              </button>
            </div>

            {isLoadingRun ? (
              <p className="text-xs text-text-tertiary">Loading metrics...</p>
            ) : metrics ? (
              <pre className="p-3 bg-bg-tertiary border border-border-primary rounded-md text-[11px] text-text-secondary overflow-auto max-h-[460px]">
                {JSON.stringify(metrics, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-text-tertiary">No raw metrics payload available for this run.</p>
            )}
          </div>
        )}

        {/* Tab 6: Periodic Snapshots */}
        {activeTab === 'snapshots' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border-primary">
              <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Periodic Walk-Forward Snapshots
              </span>
            </div>

            {isLoadingSnapshots ? (
              <p className="text-xs text-text-tertiary">Loading snapshots...</p>
            ) : snapshotsData && snapshotsData.length > 0 ? (
              <div className="overflow-x-auto max-w-lg">
                <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
                  <thead className="bg-bg-tertiary text-[10px] text-text-secondary uppercase tracking-wider border-b border-border-primary">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Period</th>
                      <th className="py-2 px-3 font-semibold">Metric</th>
                      <th className="py-2 px-3 font-semibold text-right">P&amp;L Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-primary/40 font-mono">
                    {snapshotsData.map((snap) => (
                      <tr key={snap.id} className="hover:bg-bg-tertiary/40 transition-colors">
                        <td className="py-2 px-3 font-semibold text-text-primary">{snap.period}</td>
                        <td className="py-2 px-3 text-text-secondary">{snap.metricType}</td>
                        <td className={`py-2 px-3 text-right font-bold ${
                          snap.metricValue > 0 ? 'text-accent-green' : snap.metricValue < 0 ? 'text-accent-red' : 'text-text-tertiary'
                        }`}>
                          {snap.metricValue != null ? `${snap.metricValue > 0 ? '+' : ''}₹${fmt(snap.metricValue)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-text-tertiary">No snapshot records generated for this run.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
