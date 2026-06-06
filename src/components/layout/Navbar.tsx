'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, History, Columns, Info, HelpCircle, Radar } from 'lucide-react';

export const Navbar: React.FC = () => {
  const pathname = usePathname();

  const links = [
    { href: '/calculate', label: 'Calculator', icon: <Activity size={14} /> },
    { href: '/scanner', label: 'Scanner', icon: <Radar size={14} /> },
    { href: '/history', label: 'History', icon: <History size={14} /> },
    { href: '/compare', label: 'Compare', icon: <Columns size={14} /> },
    { href: '/about', label: 'About', icon: <Info size={14} /> },
    { href: '/faq', label: 'FAQ', icon: <HelpCircle size={14} /> },
  ];

  return (
    <header className="w-full bg-bg-secondary border-b border-border-primary font-mono sticky top-0 z-40 select-none">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/calculate" className="flex items-center gap-2 group">
          <div className="h-7 w-7 rounded bg-accent-blue/10 border border-accent-blue/30 flex items-center justify-center group-hover:border-accent-blue/60 transition-all duration-300">
            <span className="text-accent-blue font-bold text-sm tracking-tighter">C</span>
          </div>
          <span className="text-sm font-semibold tracking-wider text-text-primary uppercase group-hover:text-accent-blue transition-colors">
            CPR PRO <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-green/10 border border-accent-green/20 text-accent-green font-bold">LIVE</span>
          </span>
        </Link>

        {/* Navigation Items */}
        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const isActive = pathname === link.href || (link.href === '/calculate' && pathname === '/');
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                  isActive
                    ? 'bg-border-secondary text-text-primary border border-border-secondary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary border border-transparent'
                }`}
              >
                {link.icon}
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
