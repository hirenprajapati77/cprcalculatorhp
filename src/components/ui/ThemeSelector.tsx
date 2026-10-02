'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Eye, Check } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';

export interface ThemeSelectorProps {
  className?: string;
  variant?: 'compact' | 'expanded';
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  className = '',
  variant = 'compact',
}) => {
  const { theme, setTheme, options } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const getThemeIcon = (id: ThemeMode) => {
    switch (id) {
      case 'light-pro':
        return <Sun size={14} className="text-amber-400" />;
      case 'dark-oled':
        return <Moon size={14} className="text-cyan-400" />;
      case 'high-contrast':
        return <Eye size={14} className="text-emerald-400" />;
      case 'system':
        return <Monitor size={14} className="text-text-muted" />;
      case 'dark-pro':
      default:
        return <Moon size={14} className="text-blue-400" />;
    }
  };

  const currentOption = options.find((o) => o.id === theme) || options[0];

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Theme: ${currentOption.name}`}
        title={`Theme: ${currentOption.name}`}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border-primary bg-surface-panel hover:bg-surface-hover hover:border-border-secondary transition-colors text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
      >
        <span className="flex items-center justify-center w-4 h-4">
          {getThemeIcon(theme)}
        </span>
        {variant === 'expanded' && (
          <span className="hidden sm:inline-block truncate max-w-[120px]">
            {currentOption.name}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          className="absolute right-0 mt-1.5 w-64 rounded-lg bg-surface-elevated border border-border-default shadow-xl py-1 z-50 animate-fade-in"
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted border-b border-border-subtle">
            Select Workspace Theme
          </div>

          <div className="py-1">
            {options.map((opt) => {
              const isSelected = opt.id === theme;
              return (
                <button
                  key={opt.id}
                  role="option"
                  aria-selected={isSelected}
                  type="button"
                  onClick={() => {
                    setTheme(opt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs transition-colors hover:bg-surface-hover ${
                    isSelected ? 'bg-surface-selected text-text-primary font-medium' : 'text-text-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                      {getThemeIcon(opt.id)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-text-primary">{opt.name}</span>
                        {opt.badge && (
                          <span className="text-[9px] px-1 py-0.2 rounded font-mono uppercase bg-accent-blue/15 text-accent-blue font-semibold">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-muted truncate leading-tight mt-0.5">
                        {opt.description}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <Check size={14} className="text-accent-primary flex-shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
