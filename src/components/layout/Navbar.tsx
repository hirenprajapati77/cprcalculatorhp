'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  History,
  Columns,
  Info,
  HelpCircle,
  Radar,
  Star,
  LayoutGrid,
  Settings,
  FlaskConical,
  Menu,
  X,
  TrendingUp,
  ChevronRight,
  Zap,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Trading',
    links: [
      { href: '/calculate', label: 'Calculator', icon: <Activity size={13} />, badge: null },
      { href: '/scanner', label: 'Scanner', icon: <Radar size={13} />, badge: 'LIVE' },
      { href: '/watchlist', label: 'Watchlist', icon: <Star size={13} />, badge: null },
    ],
  },
  {
    label: 'Analysis',
    links: [
      { href: '/heatmap', label: 'Heatmap', icon: <LayoutGrid size={13} />, badge: null },
      { href: '/backtest', label: 'Backtest', icon: <FlaskConical size={13} />, badge: null },
      { href: '/compare', label: 'Compare', icon: <Columns size={13} />, badge: null },
    ],
  },
  {
    label: 'More',
    links: [
      { href: '/history', label: 'History', icon: <History size={13} />, badge: null },
      { href: '/settings', label: 'Settings', icon: <Settings size={13} />, badge: null },
      { href: '/about', label: 'About', icon: <Info size={13} />, badge: null },
      { href: '/faq', label: 'FAQ', icon: <HelpCircle size={13} />, badge: null },
    ],
  },
];

const ALL_LINKS = NAV_GROUPS.flatMap(g => g.links);

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || (href === '/calculate' && pathname === '/');

  return (
    <>
      <header
        className={`w-full sticky top-0 z-50 select-none transition-all duration-300 ${
          scrolled
            ? 'bg-[#08090c]/95 backdrop-blur-xl border-b border-[#1b1e2a] shadow-[0_1px_30px_rgba(0,0,0,0.6)]'
            : 'bg-[#08090c] border-b border-[#1b1e2a]'
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-4 h-[52px] flex items-center gap-6">

          {/* ── Brand Logo ──────────────────────────────────────── */}
          <Link href="/calculate" className="flex items-center gap-2.5 group shrink-0">
            <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600/30 to-purple-600/20 border border-blue-500/30 flex items-center justify-center group-hover:border-blue-400/60 group-hover:shadow-[0_0_12px_rgba(59,130,246,0.3)] transition-all duration-300">
              <TrendingUp size={15} className="text-blue-400" />
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-[#08090c] animate-pulse" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[13px] font-bold tracking-wider text-white uppercase group-hover:text-blue-300 transition-colors">
                CPR PRO
              </span>
              <span className="text-[8px] text-slate-500 tracking-[0.15em] uppercase font-medium">
                Trading Platform
              </span>
            </div>
          </Link>

          {/* ── Desktop Nav ──────────────────────────────────────── */}
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {/* Divider dot */}
            <div className="w-px h-5 bg-slate-800 mx-2" />

            {ALL_LINKS.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-200 font-mono tracking-wide ${
                    active
                      ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className={active ? 'text-blue-400' : 'text-slate-500'}>
                    {link.icon}
                  </span>
                  <span className="hidden lg:inline">{link.label}</span>
                  {link.badge === 'LIVE' && (
                    <span className="flex items-center gap-0.5 px-1 py-0 rounded text-[7px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 uppercase tracking-wider">
                      <Zap size={7} />
                      LIVE
                    </span>
                  )}
                  {active && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-blue-400" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* ── Right Cluster ─────────────────────────────────────── */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* Market Status Chip */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/8 border border-emerald-500/20 text-[10px] font-semibold text-emerald-400 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>NSE · LIVE</span>
            </div>

            {/* Settings shortcut (desktop) */}
            <Link
              href="/settings"
              className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5 hover:border-slate-700 transition-all"
              title="Settings"
            >
              <Settings size={13} />
            </Link>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(v => !v)}
              className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-white/5 transition-all"
            >
              {mobileOpen ? <X size={15} /> : <Menu size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Drawer ────────────────────────────────────────── */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-all duration-300 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />

        {/* Drawer Panel */}
        <div
          className={`absolute top-[52px] left-0 right-0 bg-[#0d0f18] border-b border-slate-800 shadow-2xl transition-transform duration-300 ${
            mobileOpen ? 'translate-y-0' : '-translate-y-4'
          }`}
        >
          <div className="p-4 space-y-4">
            {NAV_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2 px-1">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.links.map(link => {
                    const active = isActive(link.href);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] font-semibold transition-all ${
                          active
                            ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <span className={active ? 'text-blue-400' : 'text-slate-600'}>
                          {link.icon}
                        </span>
                        {link.label}
                        {link.badge === 'LIVE' && (
                          <span className="ml-auto text-[7px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 uppercase">
                            LIVE
                          </span>
                        )}
                        {active && <ChevronRight size={11} className="ml-auto text-blue-400" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
