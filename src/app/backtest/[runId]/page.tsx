'use client';

import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, BarChart2, List, FileText, Database } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

export default function RunDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params?.runId as string;
  const [activeTab, setActiveTab] = useState('summary');

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
              <h3 className="text-lg font-semibold text-cyan-400">Execution Summary</h3>
              <p className="text-muted-foreground">Configuration, Universe, and status will load here via React Query.</p>
              <Link href={`/analytics/${runId}`} className="inline-flex items-center gap-2 bg-cyan-500/20 text-cyan-400 px-4 py-2 rounded-md hover:bg-cyan-500/30 transition">
                <BarChart2 className="w-4 h-4" /> View Full Analytics
              </Link>
            </div>
          )}

          {activeTab === 'trades' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-cyan-400">Trade Ledger</h3>
              <p className="text-muted-foreground">Virtual list of trades with links to Execution Replay.</p>
              {/* Mock Trade Row */}
              <div className="p-3 border border-border/50 rounded flex justify-between items-center bg-white/5">
                <div>
                  <span className="font-bold">LONG</span> <span className="text-muted-foreground">SYM1</span>
                </div>
                <Link href="/replay/mock-trade-123" className="text-sm text-cyan-400 hover:underline">Replay Trade</Link>
              </div>
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-cyan-400">Raw Metrics Payload</h3>
              <pre className="p-4 bg-black/50 rounded-md text-xs text-muted-foreground overflow-auto">
                {JSON.stringify({ winRate: 55, profitFactor: 1.5 }, null, 2)}
              </pre>
            </div>
          )}

          {activeTab === 'snapshots' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-cyan-400">Periodic Snapshots</h3>
              <p className="text-muted-foreground">Monthly PnL distributions.</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
