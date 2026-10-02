'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  BarChart3,
  Percent,
  Scale,
  Activity,
  TrendingUp,
  FlaskConical,
} from 'lucide-react';
import Link from 'next/link';
import { fmt } from '@/utils/format';

const DynamicChartsGrid = dynamic(() => import('./ChartsGrid'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 font-mono select-none">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="border border-border-primary bg-bg-secondary rounded-lg p-4 h-80 flex flex-col justify-between">
          <div className="h-4 w-1/3 bg-bg-tertiary rounded animate-pulse" />
          <div className="flex-1 bg-bg-tertiary/40 rounded mt-4 animate-pulse" />
        </div>
      ))}
    </div>
  ),
});

export default function AnalyticsRunPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params?.runId as string | undefined;

  const { data: runData, isLoading } = useQuery({
    queryKey: ['metrics', runId],
    queryFn: async () => {
      const res = await fetch(`/api/backtest?runId=${runId}`);
      if (!res.ok) throw new Error('Failed to fetch run data');
      return res.json();
    },
    enabled: !!runId && runId !== 'undefined',
  });

  const metrics = runData?.metrics;

  if (!runId || runId === 'undefined') {
    return (
      <div className="text-center py-16 bg-bg-secondary border border-border-primary rounded-lg font-mono">
        <p className="text-sm font-semibold text-text-primary mb-1">Invalid Simulation ID</p>
        <p className="text-xs text-text-tertiary">Please navigate to Analytics from an existing backtest run.</p>
        <Link
          href="/backtest"
          className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold text-accent-blue hover:underline"
        >
          <ArrowLeft size={13} /> Return to Backtest Terminal
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-16 bg-bg-secondary border border-border-primary rounded-lg font-mono text-xs text-text-tertiary animate-pulse">
        Loading Backtest Simulation Analytics Context...
      </div>
    );
  }

  if (!metrics && runData) {
    return (
      <div className="text-center py-16 bg-bg-secondary border border-border-primary rounded-lg font-mono space-y-2">
        <p className="text-sm font-semibold text-text-primary">Quantitative Metrics Not Yet Generated</p>
        <p className="text-xs text-text-tertiary">
          Run status: <span className="font-bold text-accent-amber uppercase">{runData.status || 'UNKNOWN'}</span>
        </p>
        <p className="text-[11px] text-text-tertiary max-w-md mx-auto">
          Metrics are computed immediately once the simulation finishes. Please refresh or re-check run history.
        </p>
        <div className="pt-2">
          <Link
            href={`/backtest/${runId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-blue hover:underline"
          >
            <ArrowLeft size={13} /> View Run Details
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-mono select-none">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/backtest/${runId}`)}
            className="p-1.5 hover:bg-bg-tertiary rounded-md transition-colors text-text-tertiary hover:text-text-primary border border-border-primary"
            title="Return to Backtest Run"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-accent-blue/10 text-accent-blue">
                <BarChart3 size={16} />
              </span>
              <h1 className="text-base font-bold text-text-primary tracking-tight">
                Quantitative Performance Analytics
              </h1>
              <span className="text-[10px] bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-2 py-0.5 rounded font-semibold uppercase">
                Run Simulation
              </span>
            </div>
            <div className="text-[11px] text-text-tertiary mt-0.5">
              Run ID: <span className="text-text-secondary select-all">{runId}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/backtest/${runId}`}
            className="inline-flex items-center gap-1.5 bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-secondary hover:text-text-primary border border-border-primary px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
          >
            <FlaskConical size={13} />
            Backtest Run Details
          </Link>
        </div>
      </div>

      {/* ── Key Metrics Cards (FACTS) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

        <div className="bg-bg-secondary border border-border-primary rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-text-tertiary uppercase">
            <span className="flex items-center gap-1 font-semibold">
              <Activity size={11} className="text-accent-red" />
              Max Drawdown
            </span>
            <span className="text-[8px] bg-accent-red/10 text-accent-red font-bold px-1 rounded">FACT</span>
          </div>
          <div className="text-xl font-bold text-accent-red mt-1">
            {metrics?.maxDrawdown != null ? `${Number(metrics.maxDrawdown).toFixed(1)}%` : '—'}
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Peak-to-Trough</div>
        </div>

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
          <div className="text-[10px] text-text-tertiary mt-0.5">R Multiplier / Trade</div>
        </div>
      </div>

      {/* ── Dynamic Charts Grid ── */}
      <DynamicChartsGrid runId={runId} />
    </div>
  );
}
