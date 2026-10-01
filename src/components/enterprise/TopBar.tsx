'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  Search,
  Activity,
  TrendingUp,
  Settings,
  Clock,
  Radio,
} from 'lucide-react';
import { ThemeSelector } from '@/components/ui/ThemeSelector';

interface MarketStatusData {
  cashSessionState: 'LIVE' | 'PRESESSION' | 'CLOSED';
  isMarketOpen: boolean;
  marketProfile?: string;
  sessionState?: string;
}

interface TopBarProps {
  onOpenMobileMenu: () => void;
  onOpenCommandPalette: () => void;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenMobileMenu,
  onOpenCommandPalette,
  className = '',
}) => {
  const pathname = usePathname();
  const [marketStatus, setMarketStatus] = useState<MarketStatusData>({
    cashSessionState: 'CLOSED',
    isMarketOpen: false,
  });
  const [isOnline, setIsOnline] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [fyersConnected, setFyersConnected] = useState<boolean | null>(null);

  // Network online listener
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Market status polling
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/market-status');
        if (res.ok) {
          const data = (await res.json()) as MarketStatusData;
          setMarketStatus(data);
          setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit' }));
        }
      } catch {
        // Fallback silently if offline
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fyers status check
  useEffect(() => {
    const checkFyers = async () => {
      try {
        const res = await fetch('/api/broker/fyers/status');
        if (res.ok) {
          const data = await res.json();
          setFyersConnected(Boolean(data.connected));
        }
      } catch {
        setFyersConnected(null);
      }
    };
    checkFyers();
    const interval = setInterval(checkFyers, 60000);
    return () => clearInterval(interval);
  }, []);

  const getBreadcrumbTitle = () => {
    if (pathname === '/') return 'Dashboard';
    if (pathname === '/scanner') return 'Scanner Workspace';
    if (pathname === '/watchlist') return 'Watchlist';
    if (pathname === '/calculate') return 'CPR Calculator';
    if (pathname === '/journal') return 'Trade Journal';
    if (pathname === '/backtest') return 'Backtest Terminal';
    if (pathname === '/compare') return 'Pair Compare';
    if (pathname === '/heatmap') return 'Sector Heatmap';
    if (pathname === '/market-tools/breadth') return 'Market Breadth';
    if (pathname === '/market-tools/breakout') return 'Multi-Year Breakouts';
    if (pathname === '/market-tools/pattern-breakout') return '52W Patterns';
    if (pathname === '/market-tools/momentum-leaders') return 'Momentum Leaders';
    if (pathname === '/history') return 'Audit History';
    if (pathname === '/settings') return 'Settings';
    if (pathname === '/about') return 'About';
    if (pathname === '/faq') return 'FAQ';
    return 'Trading Workspace';
  };

  return (
    <header
      className={`h-14 border-b border-border-default bg-surface-panel flex items-center justify-between px-2.5 sm:px-4 z-20 sticky top-0 ${className}`}
    >
      {/* ── Left Section: Mobile Toggle & Breadcrumbs ── */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu size={18} />
        </button>

        {/* Mobile brand icon */}
        <Link href="/" className="lg:hidden flex items-center gap-1.5 text-accent-primary">
          <Activity size={18} />
          <span className="font-extrabold text-xs text-text-primary">CPR PRO</span>
        </Link>

        {/* Desktop breadcrumb */}
        <div className="hidden lg:flex items-center gap-2 text-xs font-mono">
          <span className="text-text-muted">Workstation</span>
          <span className="text-border-strong">/</span>
          <span className="font-semibold text-text-primary">{getBreadcrumbTitle()}</span>
        </div>
      </div>

      {/* ── Center Section: Persistent Market Ticker ── */}
      <div className="hidden xl:flex items-center gap-4 text-xs font-mono">
        {/* Market Cash Session State */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
            !isOnline
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
              : marketStatus.cashSessionState === 'LIVE'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
              : marketStatus.cashSessionState === 'PRESESSION'
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
              : 'bg-surface-elevated border-border-subtle text-text-muted'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              !isOnline
                ? 'bg-amber-400'
                : marketStatus.cashSessionState === 'LIVE'
                ? 'bg-emerald-400 animate-pulse'
                : marketStatus.cashSessionState === 'PRESESSION'
                ? 'bg-amber-400'
                : 'bg-text-disabled'
            }`}
          />
          <span>
            {!isOnline
              ? 'OFFLINE'
              : marketStatus.cashSessionState === 'LIVE'
              ? 'NSE LIVE'
              : marketStatus.cashSessionState === 'PRESESSION'
              ? 'PRE-SESSION'
              : 'NSE CLOSED'}
          </span>
        </div>

        {/* NIFTY 50 Ticker Anchor */}
        <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <span className="text-text-muted font-bold">NIFTY</span>
          <span className="font-bold text-text-primary">25,180</span>
          <span className="text-[10px] text-trading-bullish flex items-center font-semibold">
            <TrendingUp size={11} className="mr-0.5" /> +0.42%
          </span>
        </div>

        <div className="w-[1px] h-3 bg-border-subtle" />

        {/* BANK NIFTY Ticker Anchor */}
        <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <span className="text-text-muted font-bold">BANKNIFTY</span>
          <span className="font-bold text-text-primary">53,920</span>
          <span className="text-[10px] text-trading-bullish flex items-center font-semibold">
            <TrendingUp size={11} className="mr-0.5" /> +0.28%
          </span>
        </div>

        <div className="w-[1px] h-3 bg-border-subtle" />

        {/* INDIA VIX Indicator */}
        <div className="flex items-center gap-1 text-[11px] text-text-secondary">
          <span className="text-text-muted font-bold">VIX</span>
          <span className="font-bold text-text-primary">12.45</span>
          <span className="text-[9px] px-1 py-0.2 rounded bg-surface-elevated text-emerald-400 font-semibold">
            LOW
          </span>
        </div>

        {lastUpdated && (
          <span className="text-[10px] text-text-muted flex items-center gap-1">
            <Clock size={10} />
            {lastUpdated} IST
          </span>
        )}
      </div>

      {/* ── Right Section: Command Palette, Theme, Health & Settings ── */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Command Palette Trigger */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-mono text-text-muted border border-border-default bg-surface-app hover:bg-surface-hover hover:border-border-strong hover:text-text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-accent-primary"
          title="Search symbols, routes, tools (Ctrl+K)"
          aria-label="Open command palette"
        >
          <Search size={13} className="text-text-muted" />
          <span className="hidden sm:inline-block text-[11px]">Search...</span>
          <kbd className="hidden sm:inline-block px-1 py-0.2 text-[9px] font-mono rounded bg-surface-elevated border border-border-subtle text-text-muted">
            Ctrl K
          </kbd>
        </button>

        {/* Data / Broker Health Indicator */}
        {fyersConnected !== null && (
          <div
            className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono border ${
              fyersConnected
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                : 'bg-surface-elevated border-border-subtle text-text-muted'
            }`}
            title={fyersConnected ? 'Fyers Data Feed Connected' : 'Fyers Offline — Yahoo Fallback Active'}
          >
            <Radio size={10} className={fyersConnected ? 'animate-pulse text-emerald-400' : 'text-text-muted'} />
            <span className="hidden md:inline">{fyersConnected ? 'FEED OK' : 'FALLBACK'}</span>
          </div>
        )}

        {/* Global Theme Selector */}
        <ThemeSelector />

        {/* Settings Shortcut */}
        <Link
          href="/settings"
          className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent hover:border-border-default transition-colors"
          title="Settings & Control Panel"
          aria-label="Settings"
        >
          <Settings size={15} />
        </Link>
      </div>
    </header>
  );
};
