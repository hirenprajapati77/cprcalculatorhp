'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';

export type ThemeMode = 'dark-pro' | 'dark-oled' | 'light-pro' | 'high-contrast' | 'system';
export type ResolvedTheme = 'dark-pro' | 'dark-oled' | 'light-pro' | 'high-contrast';

export interface ThemeOption {
  id: ThemeMode;
  name: string;
  description: string;
  badge?: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'dark-pro',
    name: 'Professional Dark',
    description: 'Low-fatigue deep slate theme for professional trading environments',
    badge: 'DEFAULT',
  },
  {
    id: 'dark-oled',
    name: 'OLED Black',
    description: 'Pitch black #000000 canvas with vivid indicators for OLED displays',
    badge: 'OLED',
  },
  {
    id: 'light-pro',
    name: 'Professional Light',
    description: 'High-clarity, non-glare light finish for bright trading desks',
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    description: 'Ultra-high accessibility contrast with saturated semantic accents',
    badge: 'ACCESSIBLE',
  },
  {
    id: 'system',
    name: 'System Default',
    description: 'Automatically follows operating system display preferences',
  },
];

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  options: ThemeOption[];
}

const STORAGE_KEY = 'cpr_ui_theme';
const DEFAULT_THEME: ThemeMode = 'dark-pro';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark-pro';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light-pro' : 'dark-pro';
}

function applyThemeToDocument(theme: ThemeMode): ResolvedTheme {
  if (typeof document === 'undefined') return 'dark-pro';
  
  const resolved = theme === 'system' ? resolveSystemTheme() : theme;
  const root = document.documentElement;

  // Set the data-theme attribute
  root.setAttribute('data-theme', resolved);
  
  // Maintain dark/light class for standard CSS framework support
  if (resolved === 'light-pro') {
    root.classList.remove('dark');
    root.classList.add('light');
  } else {
    root.classList.remove('light');
    root.classList.add('dark');
  }

  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME;
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (stored && THEME_OPTIONS.some((o) => o.id === stored)) {
        return stored;
      }
    } catch {
      // LocalStorage access may fail in incognito / restricted modes
    }
    return DEFAULT_THEME;
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    return theme === 'system' ? resolveSystemTheme() : theme;
  });

  // Apply theme change
  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // Ignore storage errors
    }
    const resolved = applyThemeToDocument(newTheme);
    setResolvedTheme(resolved);
  };

  // Listen to OS preference changes when theme is set to 'system'
  useEffect(() => {
    const resolved = applyThemeToDocument(theme);
    setResolvedTheme(resolved);

    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      const updated = applyThemeToDocument('system');
      setResolvedTheme(updated);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      options: THEME_OPTIONS,
    }),
    [theme, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
