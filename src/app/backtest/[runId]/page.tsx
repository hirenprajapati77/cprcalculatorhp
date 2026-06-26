'use client';

import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, BarChart2, List, FileText, Database, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

export default function RunDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params?.runId as string;
  
  const [activeTab, setActiveTab] = useState('summary');
  const [tradePage, setTradePage] = useState(1);
  const tradeLimit = 50;

  // 1. Fetch Summary & Metrics
  const { data: runData, isLoading: isLoadingRun } = useQuery({
    queryKey: ['backtestRun', runId],
    queryFn: async () => {
      const res = await fetch(`/api/backtest?runId=${runId}`);
      if (!res.ok) throw new Error('Failed to fetch run data');
      return res.json();
    }
  });

  // 2. Fetch Paginated Trades
  const { data: tradesData, isLoading: isLoadingTrades } = useQuery({
    queryKey: ['backtestTrades', runId, tradePage],
    queryFn: async () => {
      const res = await fetch(`/api/backtest/${runId}/trades?page=${tradePage}&limit=${tradeLimit}`);
      if (!res.ok) throw new Error('Failed to fetch trades');
      return res.json();
    },
    enabled: activeTab === 'trades' // only fetch if tab is active
  });

  // 3. Fetch Snapshots
  const { data: snapshotsData, isLoading: isLoadingSnapshots } = useQuery({
    queryKey: ['backtestSnapshots', runId],
    queryFn: async () => {
      const res = await fetch(`/api/backtest/${runId}/snapshots`);
      if (!res.ok) throw new Error('Failed to fetch snapshots');
      return res.json();
    },
    enabled: activeTab === 'snapshots'
  });

  const tabs = [
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'trades', label: 'Trades', icon: List },
    { id: 'metrics', label: 'Metrics', icon: BarChart2 },
    { id: 'snapshots', label: 'Snapshots', icon: Database },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => router.push('/backtest')}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-muted-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-600">Run Details</h1>
          <p className="text-sm text-muted-foreground">{runId}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border/50 mb-6">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab.id 
                  ? 'border-cyan-400 text-cyan-400 font-medium' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="h-full border border-border bg-card rounded-xl p-6"
        >
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-cyan-400">Execution Summary</h3>
                <Link href={`/analytics/${runId}`} className="inline-flex items-center gap-2 bg-cyan-500/20 text-cyan-400 px-4 py-2 rounded-md hover:bg-cyan-500/30 transition">
                  <BarChart2 className="w-4 h-4" /> View Full Analytics
                </Link>
              </div>
              {isLoadingRun ? (
                <p className="text-muted-foreground">Loading summary...</p>
              ) : runData ? (
                <div className="grid grid-cols-2 gap-4 bg-black/20 p-4 rounded-lg border border-border/50 text-sm">
                  <div><span className="text-muted-foreground">Universe:</span> <span className="font-medium">{runData.universe}</span></div>
                  <div><span className="text-muted-foreground">Capital:</span> <span className="font-medium">₹{runData.capital}</span></div>
                  <div><span className="text-muted-foreground">Start Date:</span> <span className="font-medium">{new Date(runData.startDate).toLocaleDateString()}</span></div>
                  <div><span className="text-muted-foreground">End Date:</span> <span className="font-medium">{new Date(runData.endDate).toLocaleDateString()}</span></div>
                  <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{runData.status}</span></div>
                  <div><span className="text-muted-foreground">Execution:</span> <span className="font-medium">{runData.executionMode}</span></div>
                  <div><span className="text-muted-foreground">Risk Model:</span> <span className="font-medium">{runData.riskModel} ({runData.riskValue}%)</span></div>
                </div>
              ) : (
                <p className="text-red-400">Failed to load run data.</p>
              )}
            </div>
          )}

          {activeTab === 'trades' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-cyan-400">Trade Ledger</h3>
              {isLoadingTrades ? (
                <p className="text-muted-foreground">Loading trades...</p>
              ) : tradesData?.trades ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="text-xs text-muted-foreground bg-black/40 border-b border-border/50">
                      <tr>
                        <th className="px-4 py-3">Symbol</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Signal</th>
                        <th className="px-4 py-3">Entry Date</th>
                        <th className="px-4 py-3">Entry ₹</th>
                        <th className="px-4 py-3">Exit Date</th>
                        <th className="px-4 py-3">Exit ₹</th>
                        <th className="px-4 py-3">P&L</th>
                        <th className="px-4 py-3">P&L%</th>
                        <th className="px-4 py-3">Duration</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradesData.trades.map((trade: any) => (
                        <tr key={trade.id} className="border-b border-border/20 hover:bg-white/5">
                          <td className="px-4 py-2 font-medium">{trade.symbol}</td>
                          <td className="px-4 py-2">{trade.type}</td>
                          <td className="px-4 py-2 truncate max-w-[150px]" title={trade.signal}>{trade.signal}</td>
                          <td className="px-4 py-2">{new Date(trade.entryDate).toLocaleDateString()}</td>
                          <td className="px-4 py-2">{trade.entryPrice?.toFixed(2) || '-'}</td>
                          <td className="px-4 py-2">{trade.exitDate ? new Date(trade.exitDate).toLocaleDateString() : '-'}</td>
                          <td className="px-4 py-2">{trade.exitPrice?.toFixed(2) || '-'}</td>
                          <td className={`px-4 py-2 font-medium ${trade.pnl > 0 ? 'text-green-400' : trade.pnl < 0 ? 'text-red-400' : ''}`}>
                            {trade.pnl != null ? (trade.pnl > 0 ? '+' : '') + trade.pnl.toFixed(2) : '-'}
                          </td>
                          <td className={`px-4 py-2 ${trade.pnlPercent > 0 ? 'text-green-400' : trade.pnlPercent < 0 ? 'text-red-400' : ''}`}>
                            {trade.pnlPercent != null ? trade.pnlPercent.toFixed(2) + '%' : '-'}
                          </td>
                          <td className="px-4 py-2">{trade.durationDays}d</td>
                          <td className="px-4 py-2">{trade.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Pagination */}
                  <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
                    <div>
                      Showing page {tradesData.page} of {tradesData.totalPages || 1} ({tradesData.total} total trades)
                    </div>
                    <div className="flex gap-2">
                      <button 
                        disabled={tradePage === 1}
                        onClick={() => setTradePage(p => Math.max(1, p - 1))}
                        className="p-1 rounded bg-black/20 hover:bg-white/10 disabled:opacity-50"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button 
                        disabled={tradePage >= (tradesData.totalPages || 1)}
                        onClick={() => setTradePage(p => p + 1)}
                        className="p-1 rounded bg-black/20 hover:bg-white/10 disabled:opacity-50"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No trades found.</p>
              )}
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-cyan-400">Raw Metrics Payload</h3>
              {isLoadingRun ? (
                <p className="text-muted-foreground">Loading metrics...</p>
              ) : runData?.metrics ? (
                <pre className="p-4 bg-black/50 rounded-md text-xs text-muted-foreground overflow-auto">
                  {JSON.stringify(runData.metrics, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">No metrics generated yet.</p>
              )}
            </div>
          )}

          {activeTab === 'snapshots' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-cyan-400">Periodic Snapshots</h3>
              {isLoadingSnapshots ? (
                <p className="text-muted-foreground">Loading snapshots...</p>
              ) : snapshotsData && snapshotsData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse max-w-md">
                    <thead className="text-xs text-muted-foreground bg-black/40 border-b border-border/50">
                      <tr>
                        <th className="px-4 py-3">Period</th>
                        <th className="px-4 py-3">Metric Type</th>
                        <th className="px-4 py-3 text-right">Value (PnL)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshotsData.map((snap: any) => (
                        <tr key={snap.id} className="border-b border-border/20 hover:bg-white/5">
                          <td className="px-4 py-2 font-medium">{snap.period}</td>
                          <td className="px-4 py-2 text-muted-foreground">{snap.metricType}</td>
                          <td className={`px-4 py-2 text-right font-medium ${snap.metricValue > 0 ? 'text-green-400' : snap.metricValue < 0 ? 'text-red-400' : ''}`}>
                            {snap.metricValue != null ? (snap.metricValue > 0 ? '+' : '') + snap.metricValue.toFixed(2) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-foreground">No snapshot data available.</p>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
