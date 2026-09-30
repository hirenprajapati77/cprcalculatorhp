'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sidebar, SIDEBAR_SECTIONS } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { Footer } from '@/components/layout/Footer';
import { Activity, X, ChevronRight } from 'lucide-react';

interface EnterpriseShellProps {
  children: React.ReactNode;
  shadowMode?: boolean;
}

export const EnterpriseShell: React.FC<EnterpriseShellProps> = ({
  children,
  shadowMode = false,
}) => {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Initialize sidebar collapsed state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cpr_sidebar_collapsed');
      if (stored !== null) {
        setCollapsed(stored === 'true');
      }
    } catch {
      // LocalStorage unavailable in private mode
    }
  }, []);

  // Persist sidebar collapsed state
  const handleToggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cpr_sidebar_collapsed', String(next));
      } catch {
        // LocalStorage unavailable
      }
      return next;
    });
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Global keyboard shortcuts:
  // - Ctrl+K / Cmd+K -> Command Palette
  // - Ctrl+[ -> Toggle Sidebar
  // - Esc -> Close overlays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command palette trigger
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Sidebar collapse toggle
      if ((e.ctrlKey || e.metaKey) && e.key === '[') {
        e.preventDefault();
        handleToggleCollapse();
        return;
      }

      // Escape close
      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
        } else if (mobileOpen) {
          setMobileOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, mobileOpen, handleToggleCollapse]);

  // Prevent background scrolling when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

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
    <div className="min-h-screen flex bg-surface-app text-text-primary antialiased selection:bg-accent-primary/20 selection:text-text-primary">
      {/* ── Left Sidebar (Desktop) ── */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      {/* ── Main Application Column ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-surface-app overflow-x-hidden">
        {/* Shadow mode warning banner */}
        {shadowMode && (
          <div className="w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-center gap-2 text-amber-500 text-xs font-medium tracking-wide z-30 relative select-none font-mono">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            SHADOW VALIDATION MODE — NO LIVE ORDERS WILL BE ROUTED
          </div>
        )}

        {/* Persistent Top Navigation & Market Ticker */}
        <TopBar
          onOpenMobileMenu={() => setMobileOpen(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />

        {/* Dynamic Enterprise Workstation Canvas */}
        <main className="flex-1 flex flex-col min-w-0 w-full px-3 sm:px-5 lg:px-6 py-3 sm:py-5 overflow-x-hidden">
          {children}
        </main>

        {/* Enterprise System Footer */}
        <Footer />
      </div>

      {/* ── Global Command Palette (Ctrl+K) ── */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {/* ── Mobile Navigation Drawer ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-surface-panel border-r border-border-default shadow-2xl flex flex-col z-10 animate-fade-in">
            {/* Drawer Header */}
            <div className="h-14 border-b border-border-subtle flex items-center justify-between px-4">
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 text-accent-primary"
              >
                <div className="w-7 h-7 rounded-lg bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary">
                  <Activity size={16} />
                </div>
                <div>
                  <span className="font-extrabold text-xs text-text-primary">CPR PRO</span>
                  <span className="ml-1 text-[8px] font-mono font-bold px-1 py-0.2 rounded bg-accent-primary/15 text-accent-primary">
                    V2
                  </span>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Scrollable Navigation */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {SIDEBAR_SECTIONS.map((section) => (
                <div key={section.title} className="space-y-1">
                  <div className="px-2 py-1 text-[9px] font-bold tracking-widest text-text-muted uppercase font-mono">
                    {section.title}
                  </div>
                  <div className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isRouteActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                            active
                              ? 'bg-surface-selected text-text-primary font-semibold'
                              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={active ? 'text-accent-primary' : 'text-text-muted'}>
                              {item.icon}
                            </span>
                            <span className="truncate text-[11px] font-mono">{item.label}</span>
                          </div>
                          {item.badge ? (
                            <span
                              className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${getBadgeClass(
                                item.badgeVariant
                              )}`}
                            >
                              {item.badge}
                            </span>
                          ) : (
                            active && <ChevronRight size={12} className="text-accent-primary" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Drawer Footer */}
            <div className="p-3 border-t border-border-subtle bg-surface-app flex items-center justify-between text-[10px] text-text-muted font-mono">
              <span>CPR PRO Workstation</span>
              <span className="text-accent-primary font-bold">NSE F&amp;O</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnterpriseShell;
