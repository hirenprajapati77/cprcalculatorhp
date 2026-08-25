'use client';

import React, { useEffect, useState } from 'react';
import { MarketBreadthReport, UniverseBreadth } from '@/services/market-tools/market-breadth.service';

export default function MarketBreadthPage() {
  const [report, setReport] = useState<MarketBreadthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUniverse, setSelectedUniverse] = useState<'ALL_NSE' | 'NIFTY_50' | 'NSE_FNO'>('ALL_NSE');

  useEffect(() => {
    fetchBreadth();
  }, []);

  async function fetchBreadth(forceRefresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market-tools/breadth${forceRefresh ? '?refresh=true' : ''}`);
      const json = await res.json();
      if (json.success) {
        setReport(json.data);
      } else {
        setError(json.error || 'Failed to fetch breadth report');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (loading && !report) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-8 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400 font-medium">Computing Market Breadth from DailyOhlcv...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-8 flex items-center justify-center">
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-6 max-w-md text-center space-y-4">
          <h2 className="text-xl font-bold text-red-400">Error Loading Market Breadth</h2>
          <p className="text-gray-300 text-sm">{error}</p>
          <button
            onClick={() => fetchBreadth(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg text-sm transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const currentUniverseData: UniverseBreadth =
    selectedUniverse === 'ALL_NSE'
      ? report.allNse
      : selectedUniverse === 'NIFTY_50'
      ? report.nifty50
      : report.nseFno;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Market Breadth Scanner</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50">
              {report.date}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Read-only market breadth computed from {report.tradingDaysAvailable} historical trading days ({report.allNse.totalCount} symbols)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchBreadth(true)}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-lg text-xs border border-gray-700 transition flex items-center gap-2"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Top Cards: Market Score & Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Overall Score */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-5 space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Market Regime Score</span>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-white">{report.overallScore}<span className="text-lg text-gray-500 font-normal">/100</span></span>
            <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${getRegimeBadgeClass(report.marketRegime)}`}>
              {report.marketRegime.replace('_', ' ')}
            </span>
          </div>
          <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getRegimeBarClass(report.marketRegime)}`}
              style={{ width: `${report.overallScore}%` }}
            ></div>
          </div>
        </div>

        {/* Card 2: Advance / Decline Ratio */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-5 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Advance / Decline</span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-emerald-400">{currentUniverseData.advances}</span>
            <span className="text-sm font-semibold text-gray-400">A/D: {currentUniverseData.adRatio}</span>
            <span className="text-2xl font-bold text-rose-400">{currentUniverseData.declines}</span>
          </div>
          <div className="w-full bg-rose-950/60 h-2 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${(currentUniverseData.advances / (currentUniverseData.advances + currentUniverseData.declines || 1)) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Card 3: 52-Week Highs / Lows */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-5 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">52-Week Highs vs Lows</span>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-xl font-bold text-emerald-400">{currentUniverseData.new52wHighCount}</span>
              <span className="text-xs text-gray-500 block">Highs</span>
            </div>
            <div className="text-center">
              <span className={`text-sm font-black px-2 py-0.5 rounded ${currentUniverseData.netNewHighs >= 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'}`}>
                {currentUniverseData.netNewHighs >= 0 ? `+${currentUniverseData.netNewHighs}` : currentUniverseData.netNewHighs}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-rose-400">{currentUniverseData.new52wLowCount}</span>
              <span className="text-xs text-gray-500 block">Lows</span>
            </div>
          </div>
        </div>

        {/* Card 4: Extreme Moves (+4% / -4%) */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-5 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Extreme Moves (&ge; 4%)</span>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-xl font-bold text-emerald-400">+{currentUniverseData.up4PctCount}</span>
              <span className="text-xs text-gray-500 block">Up &ge; 4%</span>
            </div>
            <div>
              <span className="text-xl font-bold text-rose-400">-{currentUniverseData.down4PctCount}</span>
              <span className="text-xs text-gray-500 block text-right">Down &ge; 4%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Universe Selector Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
        <button
          onClick={() => setSelectedUniverse('ALL_NSE')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${selectedUniverse === 'ALL_NSE' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'}`}
        >
          ALL NSE ({report.allNse.totalCount})
        </button>
        <button
          onClick={() => setSelectedUniverse('NIFTY_50')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${selectedUniverse === 'NIFTY_50' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'}`}
        >
          Nifty 50 ({report.nifty50.totalCount})
        </button>
        <button
          onClick={() => setSelectedUniverse('NSE_FNO')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${selectedUniverse === 'NSE_FNO' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'}`}
        >
          F&amp;O Universe ({report.nseFno.totalCount})
        </button>
      </div>

      {/* Moving Average Breadth Section */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-6 space-y-6">
        <h2 className="text-base font-bold text-white uppercase tracking-wider">Moving Average Breadth (% Above MA)</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MaGauge label="Above MA 10" count={currentUniverseData.aboveMa10Count} total={currentUniverseData.totalCount} pct={currentUniverseData.aboveMa10Pct} />
          <MaGauge label="Above MA 20" count={currentUniverseData.aboveMa20Count} total={currentUniverseData.totalCount} pct={currentUniverseData.aboveMa20Pct} />
          <MaGauge label="Above MA 50" count={currentUniverseData.aboveMa50Count} total={currentUniverseData.totalCount} pct={currentUniverseData.aboveMa50Pct} />
          <MaGauge label="Above MA 200" count={currentUniverseData.aboveMa200Count} total={currentUniverseData.totalCount} pct={currentUniverseData.aboveMa200Pct} />
        </div>
      </div>

      {/* Sector Strength Table */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white uppercase tracking-wider">Sector Strength &amp; Ranking</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 uppercase font-semibold">
                <th className="pb-3 px-4">Rank</th>
                <th className="pb-3 px-4">Sector</th>
                <th className="pb-3 px-4">Avg Change</th>
                <th className="pb-3 px-4">Advances / Declines</th>
                <th className="pb-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {report.sectors.map((sec) => (
                <tr key={sec.sector} className="hover:bg-gray-800/40 transition">
                  <td className="py-3 px-4 font-bold text-gray-300">#{sec.rank}</td>
                  <td className="py-3 px-4 font-bold text-white">{sec.sector}</td>
                  <td className={`py-3 px-4 font-extrabold ${sec.avgChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {sec.avgChangePct >= 0 ? `+${sec.avgChangePct}%` : `${sec.avgChangePct}%`}
                  </td>
                  <td className="py-3 px-4 text-gray-300">
                    <span className="text-emerald-400 font-semibold">{sec.advances}</span> / <span className="text-rose-400 font-semibold">{sec.declines}</span> ({sec.totalStocks} total)
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${sec.status === 'BULLISH' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : sec.status === 'BEARISH' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-gray-800 text-gray-300 border border-gray-700'}`}>
                      {sec.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MaGauge({ label, count, total, pct }: { label: string; count: number; total: number; pct: number }) {
  const isHealthy = pct >= 50;
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="text-xs font-semibold text-gray-400">{label}</span>
        <span className="text-xs text-gray-500">{count}/{total}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className={`text-2xl font-extrabold ${isHealthy ? 'text-emerald-400' : 'text-rose-400'}`}>
          {pct}%
        </span>
      </div>
      <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${isHealthy ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: `${pct}%` }}
        ></div>
      </div>
    </div>
  );
}

function getRegimeBadgeClass(regime: MarketBreadthReport['marketRegime']) {
  switch (regime) {
    case 'EXTREME_BULLISH': return 'bg-emerald-950 text-emerald-300 border-emerald-700';
    case 'BULLISH': return 'bg-emerald-950/60 text-emerald-400 border-emerald-800';
    case 'NEUTRAL': return 'bg-yellow-950/60 text-yellow-400 border-yellow-800';
    case 'BEARISH': return 'bg-rose-950/60 text-rose-400 border-rose-800';
    case 'EXTREME_BEARISH': return 'bg-rose-950 text-rose-300 border-rose-700';
  }
}

function getRegimeBarClass(regime: MarketBreadthReport['marketRegime']) {
  switch (regime) {
    case 'EXTREME_BULLISH':
    case 'BULLISH': return 'bg-emerald-500';
    case 'NEUTRAL': return 'bg-yellow-500';
    case 'BEARISH':
    case 'EXTREME_BEARISH': return 'bg-rose-500';
  }
}
