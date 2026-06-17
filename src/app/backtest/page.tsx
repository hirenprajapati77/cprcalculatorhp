'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Play, Settings2, Activity, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function BacktestPage() {
  const queryClient = useQueryClient();
  const [universe, setUniverse] = useState('NIFTY50');
  const [capital, setCapital] = useState(100000);
  const [startDate, setStartDate] = useState('2023-01-01');
  const [endDate, setEndDate] = useState('2023-06-30');
  const [riskPercent, setRiskPercent] = useState(1.0);
  const [exitStrategy, setExitStrategy] = useState('target');
  const [executionMode, setExecutionMode] = useState('conservative');
  
  // We'll mock the hook for now to satisfy the render
  const { data: runs, isLoading } = useQuery({
    queryKey: ['backtests'],
    queryFn: async () => {
      const res = await fetch('/api/backtest');
      if (!res.ok) throw new Error('Failed to fetch runs');
      return res.json() as Promise<unknown[]>;
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Run ${new Date().toISOString()}`,
          universe,
          startDate,
          endDate,
          capital,
          riskPercent,
          exitStrategy,
          executionMode
        })
      });
      if (res.status === 503) {
        throw new Error('Backtest engine is currently unavailable. Please try again later.');
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to start backtest');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['backtests'] });
      if (data.status === 'QUEUED') {
        alert(`✅ Backtest queued! Run ID: ${data.jobId}\nIt will process in the background. Refresh the run history to check progress.`);
      }
    },
    onError: (err: Error) => {
      alert(`❌ Error: ${err.message}`);
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2 justify-between items-start">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-600">Backtest Engine</h1>
          <p className="text-muted-foreground mt-1 text-sm">Validate strategies using historical data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create Run Form */}
        <motion.div 
          className="lg:col-span-1 border border-border bg-card rounded-xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-cyan-400" /> Configure Run
          </h2>
          
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block text-muted-foreground">Universe</label>
              <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground" value={universe} onChange={(e) => setUniverse(e.target.value)}>
                <option value="NIFTY50">NIFTY 50</option>
                <option value="NSE_FNO">NSE F&O</option>
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block text-muted-foreground">Capital (₹)</label>
              <input type="number" className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground" value={capital} onChange={(e) => setCapital(Number(e.target.value))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block text-muted-foreground">Start Date</label>
                <input type="date" className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block text-muted-foreground">End Date</label>
                <input type="date" className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block text-muted-foreground">Risk %</label>
                <input type="number" step="0.1" className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground" value={riskPercent} onChange={(e) => setRiskPercent(Number(e.target.value))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block text-muted-foreground">Exit Strategy</label>
                <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground" value={exitStrategy} onChange={(e) => setExitStrategy(e.target.value)}>
                  <option value="target">Target 1:1</option>
                  <option value="trail">Trailing SL</option>
                  <option value="eod">End of Day</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block text-muted-foreground">Execution</label>
                <select className="w-full bg-background border border-border rounded-md px-3 py-2 text-foreground" value={executionMode} onChange={(e) => setExecutionMode(e.target.value)}>
                  <option value="conservative">Conservative</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
            </div>

            <button 
              className="mt-4 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white py-2 rounded-md font-medium transition-all"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Starting...' : <><Play className="w-4 h-4" /> Start Backtest</>}
            </button>
          </div>
        </motion.div>

        {/* Active/History Runs */}
        <motion.div 
          className="lg:col-span-2 border border-border bg-card rounded-xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" /> Run History
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="py-3 px-4 font-medium text-muted-foreground">Status</th>
                  <th className="py-3 px-4 font-medium text-muted-foreground">Trades</th>
                  <th className="py-3 px-4 font-medium text-muted-foreground">Win %</th>
                  <th className="py-3 px-4 font-medium text-muted-foreground">PF</th>
                  <th className="py-3 px-4 font-medium text-muted-foreground">Sharpe</th>
                  <th className="py-3 px-4 font-medium text-muted-foreground">Created</th>
                  <th className="py-3 px-4 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading runs...</td></tr>
                ) : runs?.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No backtest runs found. Create one to begin.</td></tr>
                ) : (
                  runs?.map((run: unknown) => {
                    const r = run as { 
                      id: string, 
                      status: string, 
                      _count?: { trades: number }, 
                      createdAt: string,
                      metrics?: {
                        winRate: number;
                        profitFactor: number;
                        sharpe: number;
                      }
                    };
                    
                    const statusColor = 
                      r.status.toLowerCase() === 'completed' ? 'bg-green-500/20 text-green-400' :
                      r.status.toLowerCase() === 'running' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                      r.status.toLowerCase() === 'queued' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-cyan-500/20 text-cyan-400';

                    return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-mono uppercase ${statusColor}`}>{r.status}</span>
                      </td>
                      <td className="py-3 px-4 font-mono">{r._count?.trades || 0}</td>
                      <td className="py-3 px-4 font-mono">{r.metrics?.winRate !== undefined ? `${r.metrics.winRate.toFixed(1)}%` : '—'}</td>
                      <td className="py-3 px-4 font-mono">{r.metrics?.profitFactor !== undefined ? r.metrics.profitFactor.toFixed(2) : '—'}</td>
                      <td className="py-3 px-4 font-mono">{r.metrics?.sharpe !== undefined ? r.metrics.sharpe.toFixed(2) : '—'}</td>
                      <td className="py-3 px-4 font-mono text-sm">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 px-4 flex gap-2">
                        <Link href={`/analytics/${r.id}`} className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-sm">
                          <Activity className="w-4 h-4" /> Analytics
                        </Link>
                        <Link href={`/backtest/${r.id}`} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
                          <ExternalLink className="w-4 h-4" /> Details
                        </Link>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
