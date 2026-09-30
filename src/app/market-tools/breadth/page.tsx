'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useRef } from 'react';
import { ExportActions } from '@/components/market-tools/ExportActions';
import { generateCsvContent, downloadFile } from '@/lib/export-utils';
import { MarketBreadthReport, UniverseBreadth } from '@/services/market-tools/market-breadth.service';
import {
  TrendingUp,
  RefreshCw,
  Search,
  Activity,
  BarChart3,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Clock,
} from 'lucide-react';

export default function MarketBreadthPage() {
  const [report, setReport] = useState<MarketBreadthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUniverse, setSelectedUniverse] = useState<'ALL_NSE' | 'NIFTY_50' | 'NSE_FNO'>('ALL_NSE');
  const [sectorSearch, setSectorSearch] = useState('');
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const controller = new AbortController();
    fetchBreadth(false, controller.signal);
    return () => {
      isMounted.current = false;
      controller.abort();
    };
  }, []);

  async function fetchBreadth(forceRefresh = false, signal?: AbortSignal) {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/market-tools/breadth${forceRefresh ? '?refresh=true' : ''}`,
        signal ? { signal } : {}
      );
      const json = await res.json();
      if (!isMounted.current) return;
      if (json.success) {
        setReport(json.data);
      } else {
        setError(json.error || 'Failed to fetch breadth report');
      }
    } catch (err) {
      if (!isMounted.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  if (loading && !report) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-16 flex items-center justify-center font-mono">
        <div className="text-center space-y-3">
          <RefreshCw size={24} className="animate-spin text-accent-blue mx-auto" />
          <p className="text-xs text-text-tertiary">Computing Market Breadth metrics across 2,600+ symbols...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-12 flex items-center justify-center font-mono">
        <div className="bg-accent-red/10 border border-accent-red/30 rounded-lg p-6 max-w-md text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-accent-red font-bold text-sm">
            <AlertTriangle size={18} />
            Error Loading Market Breadth
          </div>
          <p className="text-xs text-text-secondary">{error}</p>
          <button
            type="button"
            onClick={() => fetchBreadth(true)}
            className="px-3.5 py-1.5 bg-accent-red hover:bg-accent-red/90 text-white font-semibold rounded-md text-xs transition-colors"
          >
            Retry Breadth Calculation
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const handleExportCsv = () => {
    if (!report) return;
    const sectors =
      selectedUniverse === 'ALL_NSE'
        ? report.sectors.allNse
        : selectedUniverse === 'NIFTY_50'
        ? report.sectors.nifty50
        : report.sectors.nseFno;

    const headers = [
      'Rank',
      'Sector',
      'Universe',
      'Average Change %',
      'Advances',
      'Declines',
      'Total Stocks',
      'Advance Ratio %',
      'Status',
    ];
    const rows = sectors.map((s, idx) => [
      idx + 1,
      s.sector,
      selectedUniverse,
      s.avgChangePct,
      s.advances,
      s.declines,
      s.totalStocks,
      s.totalStocks > 0 ? ((s.advances / s.totalStocks) * 100).toFixed(1) : '0',
      s.status,
    ]);
    const csvContent = generateCsvContent(headers, rows);
    const dateStr = report.date || new Date().toISOString().split('T')[0];
    downloadFile(
      csvContent,
      `market_breadth_sectors_${selectedUniverse.toLowerCase()}_${dateStr}.csv`
    );
  };

  const currentUniverseData: UniverseBreadth =
    selectedUniverse === 'ALL_NSE'
      ? report.allNse
      : selectedUniverse === 'NIFTY_50'
      ? report.nifty50
      : report.nseFno;

  const currentSectors =
    selectedUniverse === 'ALL_NSE'
      ? report.sectors.allNse
      : selectedUniverse === 'NIFTY_50'
      ? report.sectors.nifty50
      : report.sectors.nseFno;

  const filteredSectors = currentSectors.filter((sec) => {
    if (!sectorSearch) return true;
    return sec.sector.toLowerCase().includes(sectorSearch.toLowerCase());
  });

  return (
    <div className="space-y-4 font-mono select-none">
      {/* ── Status Banner (if pending or refreshing) ── */}
      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-xs font-semibold text-accent-blue animate-pulse">
          <RefreshCw size={13} className="animate-spin" />
          <span>Refreshing Market Breadth metrics across 2,600+ symbols... Please wait.</span>
        </div>
      )}
      {!isRefreshing && report.status === 'pending' && (
        <div className="flex items-center gap-2 rounded-lg border border-accent-amber/30 bg-accent-amber/10 px-4 py-2 text-xs font-semibold text-accent-amber">
          <Clock size={13} />
          <span>Awaiting daily 19:15 IST precompute job or cold cache warmup. Click &quot;Refresh&quot; to compute on-demand.</span>
        </div>
      )}

      {/* ── Workstation Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-accent-blue/10 text-accent-blue">
              <TrendingUp size={18} />
            </span>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Market Breadth &amp; Participation Terminal
            </h1>
            <span className="text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-2 py-0.5 rounded font-semibold uppercase">
              {report.date}
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Empirical participation metrics computed across {report.tradingDaysAvailable} historical trading days ({report.allNse.totalCount} symbols).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ExportActions onExportCsv={handleExportCsv} />
          <button
            type="button"
            onClick={() => fetchBreadth(true)}
            disabled={loading || isRefreshing}
            className="px-3 py-1.5 bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white font-semibold rounded-md text-xs transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw size={13} className={loading || isRefreshing ? 'animate-spin' : ''} />
            <span>{isRefreshing ? 'Scanning...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Top KPI Strip ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Market Regime Score */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Activity size={11} className="text-accent-blue" />
              Regime Score
            </span>
            <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
              report.status === 'pending'
                ? 'bg-bg-tertiary text-text-tertiary'
                : getRegimeBadgeStyle(report.marketRegime)
            }`}>
              {report.status === 'pending' ? 'PENDING' : report.marketRegime.replace('_', ' ')}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-text-primary">
              {report.status === 'pending' ? '--' : (report.overallScore > 0 ? `+${report.overallScore}` : report.overallScore)}
              <span className="text-xs text-text-tertiary font-normal"> / 10</span>
            </span>
            <span className="text-[10px] text-text-tertiary">
              Scale -10 to +10
            </span>
          </div>
          <div className="w-full bg-bg-tertiary h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                report.status === 'pending' ? 'bg-bg-tertiary' : getRegimeBarStyle(report.marketRegime)
              }`}
              style={{ width: report.status === 'pending' ? '0%' : `${Math.min(100, Math.max(0, ((report.overallScore + 10) / 20) * 100))}%` }}
            />
          </div>
        </div>

        {/* Card 2: Advance / Decline Ratio */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Layers size={11} className="text-accent-green" />
              Advance / Decline
            </span>
            <span className="text-[9px] bg-bg-tertiary text-text-secondary px-1.5 py-0.5 rounded font-bold">
              Ratio: {report.status === 'pending' ? '--' : currentUniverseData.adRatio}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-accent-green">
              {report.status === 'pending' ? '--' : currentUniverseData.advances}
            </span>
            <span className="text-xs text-text-tertiary font-normal">Adv vs Dec</span>
            <span className="text-2xl font-bold text-accent-red">
              {report.status === 'pending' ? '--' : currentUniverseData.declines}
            </span>
          </div>
          <div className="w-full bg-accent-red/20 h-1.5 rounded-full overflow-hidden flex">
            <div
              className="bg-accent-green h-full transition-all duration-500"
              style={{
                width: report.status === 'pending'
                  ? '0%'
                  : `${(currentUniverseData.advances / (currentUniverseData.advances + currentUniverseData.declines || 1)) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Card 3: 52-Week Highs vs Lows */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <BarChart3 size={11} className="text-accent-blue" />
              52W Highs vs Lows
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
              report.status === 'pending'
                ? 'bg-bg-tertiary text-text-tertiary'
                : currentUniverseData.netNewHighs >= 0
                ? 'bg-accent-green/10 text-accent-green'
                : 'bg-accent-red/10 text-accent-red'
            }`}>
              Net: {report.status === 'pending' ? '--' : currentUniverseData.netNewHighs >= 0 ? `+${currentUniverseData.netNewHighs}` : currentUniverseData.netNewHighs}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold text-accent-green">
                {report.status === 'pending' ? '--' : currentUniverseData.new52wHighCount}
              </span>
              <span className="text-[10px] text-text-tertiary block">52W Highs</span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold text-accent-red">
                {report.status === 'pending' ? '--' : currentUniverseData.new52wLowCount}
              </span>
              <span className="text-[10px] text-text-tertiary block">52W Lows</span>
            </div>
          </div>
        </div>

        {/* Card 4: Extreme Moves (+4% / -4%) */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="font-semibold flex items-center gap-1">
              <Activity size={11} className="text-accent-amber" />
              Extreme Moves (&ge; 4%)
            </span>
            <span className="text-[9px] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded">
              VOLATILITY
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-1">
              <ArrowUpRight size={14} className="text-accent-green" />
              <div>
                <span className="text-2xl font-bold text-accent-green">
                  {report.status === 'pending' ? '--' : `+${currentUniverseData.up4PctCount}`}
                </span>
                <span className="text-[10px] text-text-tertiary block">Up &ge; 4%</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-right">
              <div>
                <span className="text-2xl font-bold text-accent-red">
                  {report.status === 'pending' ? '--' : `-${currentUniverseData.down4PctCount}`}
                </span>
                <span className="text-[10px] text-text-tertiary block">Down &ge; 4%</span>
              </div>
              <ArrowDownRight size={14} className="text-accent-red" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Universe Tabs ── */}
      <div className="flex items-center gap-1 border-b border-border-primary pb-2">
        <button
          type="button"
          onClick={() => setSelectedUniverse('ALL_NSE')}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
            selectedUniverse === 'ALL_NSE'
              ? 'bg-accent-blue text-white shadow-sm'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary border border-border-primary'
          }`}
        >
          ALL NSE ({report.allNse.totalCount})
        </button>
        <button
          type="button"
          onClick={() => setSelectedUniverse('NIFTY_50')}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
            selectedUniverse === 'NIFTY_50'
              ? 'bg-accent-blue text-white shadow-sm'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary border border-border-primary'
          }`}
        >
          NIFTY 50 ({report.nifty50.totalCount})
        </button>
        <button
          type="button"
          onClick={() => setSelectedUniverse('NSE_FNO')}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
            selectedUniverse === 'NSE_FNO'
              ? 'bg-accent-blue text-white shadow-sm'
              : 'bg-bg-secondary text-text-secondary hover:text-text-primary border border-border-primary'
          }`}
        >
          NSE F&amp;O ({report.nseFno.totalCount})
        </button>
      </div>

      {/* ── Moving Average Breadth Gauges ── */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-border-primary">
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
            Moving Average Participation (% Above MA)
          </span>
          <span className="text-[10px] text-text-tertiary">Longitudinal Trend</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MaGauge
            label="Above MA 10"
            count={currentUniverseData.aboveMa10Count}
            total={currentUniverseData.ma10EligibleCount || currentUniverseData.totalCount}
            pct={currentUniverseData.aboveMa10Pct}
            pending={report.status === 'pending'}
          />
          <MaGauge
            label="Above MA 20"
            count={currentUniverseData.aboveMa20Count}
            total={currentUniverseData.ma20EligibleCount || currentUniverseData.totalCount}
            pct={currentUniverseData.aboveMa20Pct}
            pending={report.status === 'pending'}
          />
          <MaGauge
            label="Above MA 50"
            count={currentUniverseData.aboveMa50Count}
            total={currentUniverseData.ma50EligibleCount || currentUniverseData.totalCount}
            pct={currentUniverseData.aboveMa50Pct}
            pending={report.status === 'pending'}
          />
          <MaGauge
            label="Above MA 200"
            count={currentUniverseData.aboveMa200Count}
            total={currentUniverseData.ma200EligibleCount || currentUniverseData.totalCount}
            pct={currentUniverseData.aboveMa200Pct}
            pending={report.status === 'pending'}
          />
        </div>
      </div>

      {/* ── Sector Strength & Ranking Table ── */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-border-primary">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
              Sector Strength &amp; Relative Ranking
            </span>
            <span className="text-[10px] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded">
              {filteredSectors.length} Sectors
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search sector..."
                value={sectorSearch}
                onChange={(e) => setSectorSearch(e.target.value)}
                className="bg-bg-tertiary border border-border-primary rounded px-2.5 py-1 pl-7 text-[11px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue w-36 sm:w-48"
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

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left whitespace-nowrap font-mono">
            <thead className="bg-bg-tertiary text-text-secondary text-[10px] uppercase tracking-wider border-b border-border-primary">
              <tr>
                <th className="py-2 px-3 font-semibold">Rank</th>
                <th className="py-2 px-3 font-semibold">Sector</th>
                <th className="py-2 px-3 font-semibold text-right">Avg Change %</th>
                <th className="py-2 px-3 font-semibold text-right">Advances / Declines</th>
                <th className="py-2 px-3 font-semibold text-center">Market Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-primary/40">
              {filteredSectors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-tertiary">
                    {report.status === 'pending'
                      ? 'Market breadth metrics are pending precomputation for today. Click "Refresh" to compute now.'
                      : 'No sector records match your filter criteria.'}
                  </td>
                </tr>
              ) : (
                filteredSectors.map((sec) => {
                  const rowPad = density === 'compact' ? 'py-1.5 px-3' : 'py-2.5 px-3';
                  const isPositive = sec.avgChangePct >= 0;
                  return (
                    <tr key={sec.sector} className="hover:bg-bg-tertiary/40 transition-colors">
                      <td className={`${rowPad} font-bold text-text-secondary`}>#{sec.rank}</td>
                      <td className={`${rowPad} font-bold text-text-primary`}>{sec.sector}</td>
                      <td className={`${rowPad} text-right font-bold ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
                        {isPositive ? `+${sec.avgChangePct}%` : `${sec.avgChangePct}%`}
                      </td>
                      <td className={`${rowPad} text-right text-text-secondary`}>
                        <span className="text-accent-green font-bold">{sec.advances}</span> /{' '}
                        <span className="text-accent-red font-bold">{sec.declines}</span>{' '}
                        <span className="text-text-tertiary text-[10px]">({sec.totalStocks} total)</span>
                      </td>
                      <td className={`${rowPad} text-center`}>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          sec.status === 'BULLISH'
                            ? 'bg-accent-green/10 text-accent-green border border-accent-green/20'
                            : sec.status === 'BEARISH'
                            ? 'bg-accent-red/10 text-accent-red border border-accent-red/20'
                            : 'bg-bg-tertiary text-text-secondary border border-border-primary'
                        }`}>
                          {sec.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MaGauge({
  label,
  count,
  total,
  pct,
  pending,
}: {
  label: string;
  count: number;
  total: number;
  pct: number;
  pending?: boolean;
}) {
  const isHealthy = pct >= 50;
  return (
    <div className="bg-bg-tertiary border border-border-primary rounded-lg p-3 space-y-1.5 font-mono">
      <div className="flex justify-between items-baseline">
        <span className="text-[10px] font-semibold text-text-tertiary uppercase">{label}</span>
        <span className="text-[10px] text-text-tertiary">{pending ? '--' : `${count}/${total}`}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className={`text-xl font-bold ${pending ? 'text-text-tertiary' : isHealthy ? 'text-accent-green' : 'text-accent-red'}`}>
          {pending ? '--%' : `${pct}%`}
        </span>
      </div>
      <div className="w-full bg-bg-secondary h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            pending ? 'bg-bg-tertiary' : isHealthy ? 'bg-accent-green' : 'bg-accent-red'
          }`}
          style={{ width: pending ? '0%' : `${pct}%` }}
        />
      </div>
    </div>
  );
}

function getRegimeBadgeStyle(regime: MarketBreadthReport['marketRegime']) {
  switch (regime) {
    case 'EXTREME_BULLISH':
    case 'BULLISH':
      return 'bg-accent-green/10 text-accent-green border border-accent-green/20';
    case 'NEUTRAL':
      return 'bg-accent-amber/10 text-accent-amber border border-accent-amber/20';
    case 'BEARISH':
    case 'EXTREME_BEARISH':
      return 'bg-accent-red/10 text-accent-red border border-accent-red/20';
  }
}

function getRegimeBarStyle(regime: MarketBreadthReport['marketRegime']) {
  switch (regime) {
    case 'EXTREME_BULLISH':
    case 'BULLISH':
      return 'bg-accent-green';
    case 'NEUTRAL':
      return 'bg-accent-amber';
    case 'BEARISH':
    case 'EXTREME_BEARISH':
      return 'bg-accent-red';
  }
}
