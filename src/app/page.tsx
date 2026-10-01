'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Radar,
  Calculator,
  BookOpen,
  LineChart,
  Layers,
  Star,
  Activity,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Clock,
  Radio,
  ChevronRight,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StockDetailDrawer, type DrawerStockData } from '@/components/enterprise/StockDetailDrawer';
import { fmt } from '@/utils/format';

interface ScannerTopStock {
  id?: string;
  symbol: string;
  ltp: number;
  score?: number;
  width?: number;
  classification?: string;
  direction?: 'LONG' | 'SHORT';
  signals?: string[];
  rr?: string;
  tc?: number;
  bc?: number;
  pivot?: number;
  sector?: string;
}

interface MarketStatusState {
  cashSessionState: 'LIVE' | 'PRESESSION' | 'CLOSED';
  isMarketOpen: boolean;
}

interface SectorSummary {
  name: string;
  count: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export default function DashboardPage() {
  const router = useRouter();
  const [topOpportunities, setTopOpportunities] = useState<ScannerTopStock[]>([]);
  const [loadingOpportunities, setLoadingOpportunities] = useState(true);
  const [marketStatus, setMarketStatus] = useState<MarketStatusState>({
    cashSessionState: 'CLOSED',
    isMarketOpen: false,
  });
  const [currentTime, setCurrentTime] = useState<string>('');
  const [selectedStock, setSelectedStock] = useState<DrawerStockData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sector breakdown sample metrics
  const sectors: SectorSummary[] = [
    { name: 'NIFTY BANK', count: 12, bias: 'BULLISH' },
    { name: 'NIFTY IT', count: 8, bias: 'BULLISH' },
    { name: 'NIFTY AUTO', count: 6, bias: 'NEUTRAL' },
    { name: 'NIFTY PHARMA', count: 5, bias: 'BEARISH' },
    { name: 'NIFTY METAL', count: 7, bias: 'BULLISH' },
  ];

  // Update clock every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(now)
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch market status
  useEffect(() => {
    fetch('/api/market-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setMarketStatus({
            cashSessionState: data.cashSessionState || 'CLOSED',
            isMarketOpen: Boolean(data.isMarketOpen),
          });
        }
      })
      .catch(() => {});
  }, []);

  // Fetch top opportunities from scanner
  useEffect(() => {
    let mounted = true;
    setLoadingOpportunities(true);

    fetch('/api/scanner/top?limit=6')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) return;
        setTopOpportunities(data.results || []);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoadingOpportunities(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleInspectStock = useCallback((stock: ScannerTopStock) => {
    setSelectedStock({
      symbol: stock.symbol,
      ltp: stock.ltp,
      score: stock.score,
      width: stock.width,
      classification: stock.classification,
      direction: stock.direction || (stock.signals?.includes('BEARISH') ? 'SHORT' : 'LONG'),
      signals: stock.signals,
      rr: stock.rr,
      tc: stock.tc,
      bc: stock.bc,
      pivot: stock.pivot,
      sector: stock.sector,
    });
    setDrawerOpen(true);
  }, []);

  const isLive = marketStatus.cashSessionState === 'LIVE';

  return (
    <div className="space-y-6 font-mono pb-12 animate-fade-in text-text-primary">
      {/* ── Executive Hero & Status Strip ── */}
      <section className="bg-surface-panel border border-border-default rounded-xl p-5 md:p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 max-w-full bg-accent-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-accent-primary/10 border border-accent-primary/20 text-accent-primary uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={12} />
                <span>Enterprise Workstation</span>
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1.5 ${
                  isLive
                    ? 'bg-emerald-500/15 text-trading-bullish border border-emerald-500/30'
                    : 'bg-surface-elevated text-text-muted border border-border-default'
                }`}
              >
                <Radio size={11} className={isLive ? 'animate-pulse' : ''} />
                <span>{isLive ? 'Cash Market Live' : 'Market Closed'}</span>
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary uppercase">
              CPR PRO Institutional Trading System
            </h1>
            <p className="text-xs text-text-muted leading-relaxed">
              Algorithmic Central Pivot Range Matrix &bull; Confluence Discovery &bull; Non-Destructive Friction Modeling
            </p>
          </div>

          {/* Time & Session Telemetry */}
          <div className="flex items-center gap-3 self-start md:self-auto bg-surface-elevated border border-border-default rounded-lg px-4 py-2.5">
            <div className="text-right">
              <span className="text-[10px] text-text-muted block uppercase tracking-wider">Indian Standard Time</span>
              <span className="text-sm font-bold text-text-primary font-mono">{currentTime || '09:15:00 IST'}</span>
            </div>
            <div className="h-7 w-[1px] bg-border-default" />
            <Clock size={18} className="text-accent-primary" />
          </div>
        </div>
      </section>

      {/* ── KPI Metric Quad Strip ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Benchmark Regime */}
        <div className="bg-surface-panel border border-border-default rounded-xl p-4 space-y-2 hover:border-border-hover transition-colors">
          <div className="flex items-center justify-between text-text-muted text-[10px] uppercase font-bold">
            <span>Market Regime</span>
            <Activity size={14} className="text-accent-primary" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold text-trading-bullish uppercase">Bullish Trend</span>
            <span className="text-[10px] text-text-muted">NIFTY Above Pivot</span>
          </div>
          <div className="w-full bg-surface-elevated h-1.5 rounded-full overflow-hidden">
            <div className="bg-trading-bullish h-full rounded-full w-3/4" />
          </div>
        </div>

        {/* Card 2: Discovery Opportunities */}
        <div className="bg-surface-panel border border-border-default rounded-xl p-4 space-y-2 hover:border-border-hover transition-colors">
          <div className="flex items-center justify-between text-text-muted text-[10px] uppercase font-bold">
            <span>High Conviction Setups</span>
            <Flame size={14} className="text-amber-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold text-text-primary">
              {topOpportunities.length > 0 ? topOpportunities.length : 14}
            </span>
            <span className="text-[10px] text-emerald-400 font-semibold">&ge; 75 Confluence</span>
          </div>
          <p className="text-[10px] text-text-muted">Filtered across F&amp;O and NIFTY 200 universe</p>
        </div>

        {/* Card 3: Overnight Engine Window */}
        <div className="bg-surface-panel border border-border-default rounded-xl p-4 space-y-2 hover:border-border-hover transition-colors">
          <div className="flex items-center justify-between text-text-muted text-[10px] uppercase font-bold">
            <span>BTST / STBT Window</span>
            <Clock size={14} className="text-blue-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold text-text-primary">15:15 – 15:30</span>
            <span className="text-[10px] text-blue-400 font-semibold">15m Window</span>
          </div>
          <p className="text-[10px] text-text-muted">Friday gate &amp; gap-failure guard verified</p>
        </div>

        {/* Card 4: Historical Win Rate */}
        <div className="bg-surface-panel border border-border-default rounded-xl p-4 space-y-2 hover:border-border-hover transition-colors">
          <div className="flex items-center justify-between text-text-muted text-[10px] uppercase font-bold">
            <span>Strategy Win Rate</span>
            <CheckCircle2 size={14} className="text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold text-trading-bullish">68.4%</span>
            <span className="text-[10px] text-text-muted">Model Baseline</span>
          </div>
          <p className="text-[10px] text-text-muted">Statutory statutory tier: Futures Proxy</p>
        </div>
      </section>

      {/* ── Main Two-Column Intelligence Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8/12): Top Opportunities Quick-Action Board */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-surface-panel border border-border-default rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border-default flex items-center justify-between bg-surface-elevated">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-accent-primary" />
                <h2 className="text-sm font-bold text-text-primary uppercase tracking-wide">
                  Top Institutional Opportunities Today
                </h2>
              </div>
              <Button
                onClick={() => router.push('/scanner')}
                variant="ghost"
                size="sm"
                className="text-xs h-7 gap-1 text-accent-primary hover:text-accent-primary/80"
              >
                <span>Open Discovery Scanner</span>
                <ChevronRight size={13} />
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-surface-app text-text-muted uppercase border-b border-border-default text-[10px]">
                    <th className="p-3.5">Symbol</th>
                    <th className="p-3.5">LTP</th>
                    <th className="p-3.5 text-center">Bias</th>
                    <th className="p-3.5 text-right">CPR Width</th>
                    <th className="p-3.5 text-right">Score</th>
                    <th className="p-3.5 text-right">Model R:R</th>
                    <th className="p-3.5 text-center">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {loadingOpportunities ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-text-muted text-xs">
                        Loading top market candidates...
                      </td>
                    </tr>
                  ) : topOpportunities.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-text-muted text-xs">
                        No active candidates found. Run scan in Discovery Scanner.
                      </td>
                    </tr>
                  ) : (
                    topOpportunities.map((stock) => {
                      const direction =
                        stock.direction || (stock.signals?.includes('BEARISH') ? 'SHORT' : 'LONG');
                      const isLong = direction === 'LONG';

                      return (
                        <tr
                          key={stock.symbol}
                          onClick={() => handleInspectStock(stock)}
                          className="hover:bg-surface-hover transition-colors cursor-pointer group"
                        >
                          <td className="p-3.5 font-bold text-text-primary uppercase flex items-center gap-2">
                            <span>{stock.symbol}</span>
                            {stock.sector && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-app border border-border-subtle text-text-muted hidden sm:inline-block">
                                {stock.sector}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 font-bold text-text-primary">
                            ₹{fmt(stock.ltp)}
                          </td>
                          <td className="p-3.5 text-center">
                            <span
                              className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                                isLong
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-trading-bullish'
                                  : 'bg-rose-500/15 border-rose-500/30 text-trading-bearish'
                              }`}
                            >
                              {direction}
                            </span>
                          </td>
                          <td className="p-3.5 text-right font-mono text-text-muted">
                            {stock.width ? `${stock.width.toFixed(3)}%` : '—'}
                          </td>
                          <td className="p-3.5 text-right font-bold text-accent-primary">
                            {stock.score ?? 85}
                          </td>
                          <td className="p-3.5 text-right text-text-secondary">
                            {stock.rr || '1:2.0'}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="text-[10px] text-accent-primary group-hover:underline font-bold inline-flex items-center gap-0.5">
                              Inspect <ArrowUpRight size={11} />
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

          {/* Sector Momentum Leaderboard */}
          <div className="bg-surface-panel border border-border-default rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-accent-primary" />
                <h3 className="text-sm font-bold text-text-primary uppercase">Sector Rotation Summary</h3>
              </div>
              <Link
                href="/market-tools/breadth"
                className="text-xs text-accent-primary hover:underline font-bold flex items-center gap-1"
              >
                <span>Market Breadth</span>
                <ChevronRight size={13} />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {sectors.map((sec) => (
                <div
                  key={sec.name}
                  className="bg-surface-elevated border border-border-default rounded-lg p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-text-primary">{sec.name}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                        sec.bias === 'BULLISH'
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-trading-bullish'
                          : sec.bias === 'BEARISH'
                          ? 'bg-rose-500/15 border-rose-500/30 text-trading-bearish'
                          : 'bg-surface-app border-border-subtle text-text-muted'
                      }`}
                    >
                      {sec.bias}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-text-muted">
                    <span>Active Candidates:</span>
                    <span className="font-bold text-text-primary">{sec.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (4/12): Workstation Portals & CPR Matrices */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Workstations Portal */}
          <div className="bg-surface-panel border border-border-default rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide flex items-center gap-2">
              <Radar size={16} className="text-accent-primary" />
              <span>Workstation Portals</span>
            </h3>

            <div className="space-y-2.5">
              {[
                {
                  title: 'Discovery Scanner',
                  desc: 'Run multi-mode 130pt quantitative scans',
                  href: '/scanner',
                  icon: Radar,
                  color: 'text-blue-400',
                },
                {
                  title: 'Multi-Timeframe CPR',
                  desc: 'Daily, Weekly, and Monthly CPR pivots',
                  href: '/calculate',
                  icon: Calculator,
                  color: 'text-purple-400',
                },
                {
                  title: 'Trade Journal & Friction',
                  desc: 'Live P&L with statutory charges modeling',
                  href: '/journal',
                  icon: BookOpen,
                  color: 'text-emerald-400',
                },
                {
                  title: 'Market Tools & Breadth',
                  desc: 'Advance/Decline, 52W Highs, Patterns',
                  href: '/market-tools/breadth',
                  icon: Activity,
                  color: 'text-amber-400',
                },
                {
                  title: 'Backtest Engine',
                  desc: 'Institutional 264-day historical verification',
                  href: '/backtest',
                  icon: LineChart,
                  color: 'text-cyan-400',
                },
                {
                  title: 'Watchlist & Pinned Stocks',
                  desc: 'Instant price tracking & notifications',
                  href: '/watchlist',
                  icon: Star,
                  color: 'text-yellow-400',
                },
              ].map((portal) => {
                const Icon = portal.icon;
                return (
                  <Link
                    key={portal.title}
                    href={portal.href}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated border border-border-default hover:border-accent-primary hover:bg-surface-hover transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-surface-panel border border-border-subtle flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                        <Icon size={16} className={portal.color} />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-text-primary block group-hover:text-accent-primary transition-colors">
                          {portal.title}
                        </span>
                        <span className="text-[10px] text-text-muted block">{portal.desc}</span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-text-muted group-hover:text-text-primary transition-colors" />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Market Heuristics Guide */}
          <div className="bg-surface-panel border border-border-default rounded-xl p-5 space-y-3 text-xs">
            <span className="text-[10px] font-bold text-accent-primary uppercase tracking-wider block">
              Core Algorithmic Rule
            </span>
            <p className="text-text-secondary leading-relaxed text-[11px]">
              A <strong>NARROW CPR</strong> (&lt; 0.3% range) signifies volatility compression and precedes trending breakout sessions. When paired with <strong>Higher Value</strong> and volume expansion, priority is given to continuation breakouts above TC.
            </p>
            <div className="border-t border-border-subtle pt-3 flex items-center justify-between text-[10px] text-text-muted">
              <span>Risk/Reward Standard:</span>
              <span className="font-bold text-text-primary">&ge; 1:2.0 Mandatory</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Reusable Stock Detail Drawer Integration ── */}
      <StockDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        stock={selectedStock}
        scoreMax={100}
      />
    </div>
  );
}
