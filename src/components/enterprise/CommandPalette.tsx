'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  LayoutDashboard,
  Radar,
  Star,
  Activity,
  BookOpen,
  FlaskConical,
  TrendingUp,
  LayoutGrid,
  Zap,
  Flame,
  History,
  Settings,
  Sun,
  Moon,
  Eye,
  Monitor,
} from 'lucide-react';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';

export interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'NAVIGATION' | 'THEME' | 'ACTION' | 'SYMBOL';
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global keyboard shortcuts: Ctrl+K, Cmd+K, or / (when not in input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Trigger open via parent
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Command items catalog
  const commands: CommandItem[] = useMemo(() => {
    const nav = (path: string) => () => {
      router.push(path);
      onClose();
    };

    const setTh = (mode: ThemeMode) => () => {
      setTheme(mode);
      onClose();
    };

    return [
      // Navigation
      {
        id: 'nav-dashboard',
        title: 'Dashboard',
        subtitle: 'Overview of market regime, active setups, and scanner telemetry',
        category: 'NAVIGATION',
        icon: <LayoutDashboard size={15} />,
        action: nav('/'),
        keywords: ['home', 'overview', 'summary'],
      },
      {
        id: 'nav-scanner',
        title: 'Scanner Workspace',
        subtitle: 'Live algorithmic discovery across NSE F&O universe',
        category: 'NAVIGATION',
        icon: <Radar size={15} className="text-emerald-400" />,
        action: nav('/scanner'),
        keywords: ['stocks', 'cpr', 'btst', 'stbt', 'signals'],
      },
      {
        id: 'nav-watchlist',
        title: 'Watchlist',
        subtitle: 'Pinned symbols and custom tracking list',
        category: 'NAVIGATION',
        icon: <Star size={15} className="text-amber-400" />,
        action: nav('/watchlist'),
        keywords: ['favorites', 'starred'],
      },
      {
        id: 'nav-calculate',
        title: 'CPR Calculator',
        subtitle: 'Calculate Central Pivot Range, Pivot Bands, and Width',
        category: 'NAVIGATION',
        icon: <Activity size={15} />,
        action: nav('/calculate'),
        keywords: ['pivot', 'levels', 'support', 'resistance'],
      },
      {
        id: 'nav-journal',
        title: 'Trade Journal',
        subtitle: 'Trade execution records, gross P&L, and estimated net charges',
        category: 'NAVIGATION',
        icon: <BookOpen size={15} className="text-blue-400" />,
        action: nav('/journal'),
        keywords: ['pnl', 'trades', 'history', 'charges'],
      },
      {
        id: 'nav-backtest',
        title: 'Backtest Terminal',
        subtitle: 'Multi-year quantitative backtest research and equity curves',
        category: 'NAVIGATION',
        icon: <FlaskConical size={15} className="text-purple-400" />,
        action: nav('/backtest'),
        keywords: ['research', 'simulation', 'testing'],
      },
      {
        id: 'nav-heatmap',
        title: 'Sector Heatmap',
        subtitle: 'Real-time sector performance and concentration matrix',
        category: 'NAVIGATION',
        icon: <LayoutGrid size={15} />,
        action: nav('/heatmap'),
        keywords: ['sectors', 'industry', 'market'],
      },
      {
        id: 'nav-breadth',
        title: 'Market Breadth',
        subtitle: 'Advance/Decline ratio, 52W Highs/Lows, and MA distributions',
        category: 'NAVIGATION',
        icon: <TrendingUp size={15} className="text-emerald-400" />,
        action: nav('/market-tools/breadth'),
        keywords: ['breadth', 'advance', 'decline', 'highs', 'lows'],
      },
      {
        id: 'nav-breakout',
        title: 'Multi-Year Breakouts',
        subtitle: '1Y, 2Y, 3Y, 5Y, and All-Time High breakout scanner',
        category: 'NAVIGATION',
        icon: <Zap size={15} className="text-blue-400" />,
        action: nav('/market-tools/breakout'),
        keywords: ['ath', 'multi-year', 'breakout'],
      },
      {
        id: 'nav-pattern',
        title: '52W Pattern Breakouts',
        subtitle: "Cup & Handle, Flat Base, and VCP patterns with Minervini heuristics",
        category: 'NAVIGATION',
        icon: <Zap size={15} className="text-amber-400" />,
        action: nav('/market-tools/pattern-breakout'),
        keywords: ['patterns', 'cup and handle', 'vcp'],
      },
      {
        id: 'nav-momentum',
        title: 'Momentum Leaders',
        subtitle: 'High RVOL leaders and relative momentum rankings',
        category: 'NAVIGATION',
        icon: <Flame size={15} className="text-orange-400" />,
        action: nav('/market-tools/momentum-leaders'),
        keywords: ['momentum', 'rvol', 'leaders'],
      },
      {
        id: 'nav-history',
        title: 'Audit History',
        subtitle: 'Historical scan records and system lifecycle logs',
        category: 'NAVIGATION',
        icon: <History size={15} />,
        action: nav('/history'),
        keywords: ['logs', 'audit', 'scans'],
      },
      {
        id: 'nav-settings',
        title: 'Settings',
        subtitle: 'Configure scanner thresholds, appearance, and connections',
        category: 'NAVIGATION',
        icon: <Settings size={15} />,
        action: nav('/settings'),
        keywords: ['preferences', 'config', 'fyers', 'telegram'],
      },

      // Theme toggles
      {
        id: 'theme-dark-pro',
        title: 'Theme: Professional Dark',
        subtitle: 'Switch to deep slate institutional theme (Default)',
        category: 'THEME',
        icon: <Moon size={15} className="text-blue-400" />,
        action: setTh('dark-pro'),
        keywords: ['dark', 'theme', 'pro'],
      },
      {
        id: 'theme-dark-oled',
        title: 'Theme: OLED Black',
        subtitle: 'Switch to pitch black #000000 theme for OLED displays',
        category: 'THEME',
        icon: <Moon size={15} className="text-cyan-400" />,
        action: setTh('dark-oled'),
        keywords: ['oled', 'black', 'dark'],
      },
      {
        id: 'theme-light-pro',
        title: 'Theme: Professional Light',
        subtitle: 'Switch to crisp, non-glare light theme',
        category: 'THEME',
        icon: <Sun size={15} className="text-amber-400" />,
        action: setTh('light-pro'),
        keywords: ['light', 'white', 'bright'],
      },
      {
        id: 'theme-high-contrast',
        title: 'Theme: High Contrast',
        subtitle: 'Switch to ultra-high accessibility contrast theme',
        category: 'THEME',
        icon: <Eye size={15} className="text-emerald-400" />,
        action: setTh('high-contrast'),
        keywords: ['contrast', 'accessible', 'a11y'],
      },
      {
        id: 'theme-system',
        title: 'Theme: System Default',
        subtitle: 'Automatically synchronize with operating system preference',
        category: 'THEME',
        icon: <Monitor size={15} className="text-text-muted" />,
        action: setTh('system'),
        keywords: ['system', 'auto', 'os'],
      },
    ];
  }, [router, setTheme, onClose]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().trim();
    return commands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(q) ||
        cmd.subtitle.toLowerCase().includes(q) ||
        cmd.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  }, [commands, query]);

  // Keyboard navigation within list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) selected.action();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl bg-surface-elevated border border-border-default shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-surface-panel">
          <Search size={16} className="text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, tool, or theme..."
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none font-mono"
            role="combobox"
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls="command-palette-results"
            aria-activedescendant={filteredCommands[selectedIndex]?.id}
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-surface-app border border-border-subtle text-text-muted">
            ESC to close
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          id="command-palette-results"
          role="listbox"
          aria-label="Command suggestions"
          className="flex-1 overflow-y-auto p-2 space-y-1"
        >
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted font-mono">
              No matching commands or tools found for &quot;{query}&quot;
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  id={cmd.id}
                  role="option"
                  aria-selected={isSelected}
                  type="button"
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-xs transition-colors ${
                    isSelected ? 'bg-surface-selected text-text-primary font-medium' : 'text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span className={`p-1.5 rounded-md bg-surface-app border border-border-subtle flex-shrink-0 ${
                      isSelected ? 'text-accent-primary border-accent-primary/40' : 'text-text-muted'
                    }`}>
                      {cmd.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-text-primary truncate text-[11px] font-mono">
                        {cmd.title}
                      </div>
                      <div className="text-[10px] text-text-muted truncate mt-0.5">
                        {cmd.subtitle}
                      </div>
                    </div>
                  </div>

                  <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border text-text-muted border-border-subtle flex-shrink-0 ${
                    isSelected ? 'text-accent-primary border-accent-primary/30' : ''
                  }`}>
                    {cmd.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info strip */}
        <div className="px-4 py-2 border-t border-border-subtle bg-surface-panel flex items-center justify-between text-[10px] text-text-muted font-mono">
          <div className="flex items-center gap-2">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
          <span>CPR PRO Workstation</span>
        </div>
      </div>
    </div>
  );
};
