'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Radar,
  Star,
  Activity,
  BookOpen,
  FlaskConical,
  Columns,
  TrendingUp,
  LayoutGrid,
  Zap,
  Flame,
  History,
  Settings,
  HelpCircle,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?: 'blue' | 'amber' | 'green' | 'default';
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const SIDEBAR_SECTIONS: NavSection[] = [
  {
    title: 'WORKSPACE',
    items: [
      { href: '/', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
      { href: '/scanner', label: 'Scanner', icon: <Radar size={16} />, badge: 'LIVE', badgeVariant: 'green' },
      { href: '/watchlist', label: 'Watchlist', icon: <Star size={16} /> },
    ],
  },
  {
    title: 'TRADING',
    items: [
      { href: '/calculate', label: 'CPR Calculator', icon: <Activity size={16} /> },
      { href: '/journal', label: 'Trade Journal', icon: <BookOpen size={16} /> },
    ],
  },
  {
    title: 'ANALYTICS',
    items: [
      { href: '/backtest', label: 'Backtest Terminal', icon: <FlaskConical size={16} /> },
      { href: '/compare', label: 'Pair Compare', icon: <Columns size={16} /> },
    ],
  },
  {
    title: 'MARKET TOOLS',
    items: [
      { href: '/market-tools/breadth', label: 'Market Breadth', icon: <TrendingUp size={16} /> },
      { href: '/heatmap', label: 'Sector Heatmap', icon: <LayoutGrid size={16} /> },
      { href: '/market-tools/breakout', label: 'Multi-Year Breakout', icon: <Zap size={16} /> },
      { href: '/market-tools/pattern-breakout', label: '52W Patterns', icon: <Zap size={16} />, badge: 'NEW', badgeVariant: 'amber' },
      { href: '/market-tools/momentum-leaders', label: 'Momentum Leaders', icon: <Flame size={16} />, badge: 'HOT', badgeVariant: 'amber' },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { href: '/history', label: 'Audit History', icon: <History size={16} /> },
      { href: '/about', label: 'About CPR PRO', icon: <Info size={16} /> },
      { href: '/faq', label: 'FAQ', icon: <HelpCircle size={16} /> },
    ],
  },
  {
    title: 'CONFIGURATION',
    items: [
      { href: '/settings', label: 'Settings', icon: <Settings size={16} /> },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  className = '',
}) => {
  const pathname = usePathname();

  const isRouteActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const getBadgeClass = (variant?: string) => {
    switch (variant) {
      case 'green':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25';
      case 'amber':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
      case 'blue':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/25';
      default:
        return 'bg-surface-elevated text-text-muted border-border-subtle';
    }
  };

  return (
    <aside
      className={`hidden lg:flex flex-col border-r border-border-default bg-surface-panel transition-all duration-300 z-30 select-none ${
        collapsed ? 'w-16' : 'w-60'
      } ${className}`}
    >
      {/* Sidebar Header / Brand */}
      <div className="h-14 border-b border-border-subtle flex items-center justify-between px-3.5">
        <Link
          href="/"
          className={`flex items-center gap-2.5 overflow-hidden transition-all ${
            collapsed ? 'justify-center w-full' : ''
          }`}
          title="CPR PRO Trading Workstation"
        >
          <div className="w-8 h-8 rounded-lg bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary flex-shrink-0">
            <Activity size={18} className="text-accent-primary" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-wider text-xs text-text-primary">CPR PRO</span>
                <span className="text-[8px] font-mono font-bold px-1 py-0.2 rounded bg-accent-primary/15 text-accent-primary uppercase">
                  V2
                </span>
              </div>
              <div className="text-[9px] text-text-muted font-mono tracking-tight truncate">
                Quant Terminal
              </div>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {SIDEBAR_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            {!collapsed && (
              <div className="px-2.5 py-1 text-[9px] font-bold tracking-widest text-text-muted uppercase font-mono">
                {section.title}
              </div>
            )}
            {collapsed && (
              <div className="h-2 flex items-center justify-center">
                <div className="w-4 h-[1px] bg-border-subtle" />
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isRouteActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all relative ${
                      active
                        ? 'bg-surface-selected text-text-primary font-semibold shadow-sm'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                    } ${collapsed ? 'justify-center' : ''}`}
                  >
                    <span
                      className={`flex-shrink-0 transition-colors ${
                        active ? 'text-accent-primary' : 'text-text-muted group-hover:text-text-primary'
                      }`}
                    >
                      {item.icon}
                    </span>

                    {!collapsed && (
                      <span className="truncate flex-1 tracking-tight text-[11px]">
                        {item.label}
                      </span>
                    )}

                    {!collapsed && item.badge && (
                      <span
                        className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase flex-shrink-0 ${getBadgeClass(
                          item.badgeVariant
                        )}`}
                      >
                        {item.badge}
                      </span>
                    )}

                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-accent-primary" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar Collapse Toggle Footer */}
      <div className="p-2 border-t border-border-subtle flex items-center justify-between">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 py-1.5 px-2 rounded-md text-[10px] text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors font-mono"
          title={collapsed ? 'Expand sidebar (Ctrl+[)' : 'Collapse sidebar (Ctrl+[)'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight size={14} />
          ) : (
            <>
              <ChevronLeft size={14} />
              <span>Collapse Sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
