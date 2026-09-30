'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  Sliders,
  Play,
  Database,
  Cpu,
  Send,
  LogOut,
  Palette,
  Sun,
  Moon,
  Eye,
  Monitor,
  Check,
  Keyboard,
  ShieldCheck,
  AlertCircle,
  Table,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useTheme } from '@/context/ThemeContext';

function looksMaskedSecret(value: string): boolean {
  return /^\*+\d{0,4}$/.test(value) || (value.startsWith('***') && value.includes('*'));
}

export default function SettingsPage() {
  const [marketMode, setMarketMode] = useState<string>('live');
  const [defaultUniverse, setDefaultUniverse] = useState<string>('NSE_FNO');
  const [autoRefresh, setAutoRefresh] = useState<string>('15m');
  const [minPrice, setMinPrice] = useState<number>(20);
  const [minVolume, setMinVolume] = useState<number>(50000);
  const [saving, setSaving] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  const [telegramToken, setTelegramToken] = useState<string>('');
  const [telegramChatId, setTelegramChatId] = useState<string>('');
  const [telegramGroupChatId, setTelegramGroupChatId] = useState<string>('');
  const [telegramTesting, setTelegramTesting] = useState<boolean>(false);
  const [breakoutTesting, setBreakoutTesting] = useState<boolean>(false);
  const [bypassBtst, setBypassBtst] = useState<boolean>(false);
  const [fyersConnected, setFyersConnected] = useState<boolean>(false);
  const [fyersExpiry, setFyersExpiry] = useState<string>('');
  const [fyersLoading, setFyersLoading] = useState<boolean>(true);
  const [fyersDataApiOk, setFyersDataApiOk] = useState<boolean | null>(null);
  const [fyersDataApiMessage, setFyersDataApiMessage] = useState<string>('');

  // Workstation Preferences state
  const [defaultDensity, setDefaultDensity] = useState<'compact' | 'comfortable'>('compact');

  const { showToast } = useToast();
  const { theme, setTheme, options: themeOptions } = useTheme();

  // Load workstation density from localStorage
  useEffect(() => {
    try {
      const savedDensity = localStorage.getItem('cpr_table_density') as 'compact' | 'comfortable' | null;
      if (savedDensity === 'compact' || savedDensity === 'comfortable') {
        setDefaultDensity(savedDensity);
      }
    } catch {
      // LocalStorage unavailable
    }
  }, []);

  const handleDensityChange = (density: 'compact' | 'comfortable') => {
    setDefaultDensity(density);
    try {
      localStorage.setItem('cpr_table_density', density);
      showToast(`Default workspace density updated to ${density}`, 'info');
    } catch {
      // LocalStorage unavailable
    }
  };

  // Load settings from server on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('Failed to load settings');
        const data = await res.json();
        const s = data.settings;
        setMarketMode(s.marketMode);
        setDefaultUniverse(s.defaultUniverse);
        setAutoRefresh(s.autoRefresh);
        setMinPrice(s.minPrice);
        setMinVolume(s.minVolume);
        setBypassBtst(s.bypassBtst);
        setTelegramToken(s.telegramToken);
        setTelegramChatId(s.telegramChatId);
        setTelegramGroupChatId(s.telegramGroupChatId);
      } catch (err) {
        console.error('Failed to load settings from server:', err);
        // Fallback: read from localStorage if server is unavailable
        setMarketMode(localStorage.getItem('cpr_settings_market_mode') || 'live');
        setDefaultUniverse(localStorage.getItem('cpr_settings_default_universe') || 'NSE_FNO');
        setAutoRefresh(localStorage.getItem('cpr_settings_auto_refresh') || '15m');
        setMinPrice(parseFloat(localStorage.getItem('cpr_settings_min_price') || '20'));
        setMinVolume(parseInt(localStorage.getItem('cpr_settings_min_volume') || '50000'));
        setBypassBtst(localStorage.getItem('cpr_settings_bypass_btst') === 'true');
        setTelegramToken(localStorage.getItem('cpr_settings_telegram_token') || '');
        setTelegramChatId(localStorage.getItem('cpr_settings_telegram_chat_id') || '');
        setTelegramGroupChatId(localStorage.getItem('cpr_settings_telegram_group_chat_id') || '');
      }
    }
    loadSettings();
  }, []);

  // Check Fyers connection status on mount
  useEffect(() => {
    async function checkFyers() {
      try {
        const res = await fetch('/api/broker/fyers/status');
        if (res.ok) {
          const data = await res.json();
          if (data.connected) {
            setFyersConnected(true);
            setFyersExpiry(new Date(data.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
            setFyersDataApiOk(data.dataApiOk === true);
            setFyersDataApiMessage(typeof data.dataApiMessage === 'string' ? data.dataApiMessage : '');
          } else {
            setFyersConnected(false);
            setFyersDataApiOk(null);
            setFyersDataApiMessage('');
          }
        }
      } catch (err) {
        console.error('Failed to check Fyers connection:', err);
      } finally {
        setFyersLoading(false);
      }
    }
    checkFyers();
  }, []);

  // Handle connection callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fyersParam = params.get('fyers');
    const msgParam = params.get('msg');
    if (fyersParam === 'connected') {
      showToast('Fyers account connected successfully!', 'success');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (fyersParam === 'error') {
      showToast(`Fyers connection failed: ${msgParam || 'Unknown error'}`, 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [showToast]);

  const handleTestTelegram = async () => {
    setTelegramTesting(true);
    try {
      const res = await fetch('/api/alerts/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, chatId: telegramChatId, token: telegramToken }),
      });
      if (res.ok) {
        showToast('Test alert sent to Telegram!', 'success');
      } else {
        showToast('Failed to send test alert', 'error');
      }
    } catch {
      showToast('Network error sending test alert', 'error');
    } finally {
      setTelegramTesting(false);
    }
  };

  const handleTestBreakoutAlert = async () => {
    setBreakoutTesting(true);
    try {
      const res = await fetch('/api/alerts/telegram/test-breakout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, groupChatId: telegramGroupChatId, token: telegramToken }),
      });
      if (res.ok) {
        showToast('Test breakout alert sent to Telegram group!', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast((data as { message?: string }).message || 'Failed to send test breakout alert', 'error');
      }
    } catch {
      showToast('Network error sending test breakout alert', 'error');
    } finally {
      setBreakoutTesting(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Logout failed');
      window.location.href = '/unlock';
    } catch {
      showToast('Failed to log out', 'error');
      setLoggingOut(false);
    }
  };

  // Save settings to server (and localStorage as local cache)
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      marketMode,
      defaultUniverse,
      autoRefresh,
      minPrice,
      minVolume,
      bypassBtst,
      telegramToken,
      telegramChatId,
      telegramGroupChatId,
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Server returned error');

      // Also keep localStorage in sync as a local cache / offline fallback
      localStorage.setItem('cpr_settings_market_mode', marketMode);
      localStorage.setItem('cpr_settings_default_universe', defaultUniverse);
      localStorage.setItem('cpr_settings_auto_refresh', autoRefresh);
      localStorage.setItem('cpr_settings_min_price', minPrice.toString());
      localStorage.setItem('cpr_settings_min_volume', minVolume.toString());
      localStorage.setItem('cpr_settings_telegram_token', telegramToken);
      localStorage.setItem('cpr_settings_telegram_chat_id', telegramChatId);
      localStorage.setItem('cpr_settings_telegram_group_chat_id', telegramGroupChatId);
      localStorage.setItem('cpr_settings_bypass_btst', bypassBtst ? 'true' : 'false');

      showToast('Settings saved — synced across all devices ✓', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to save settings to server', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 font-mono select-none text-xs">
      {/* ── Workstation Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-bg-secondary border border-border-primary rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-accent-blue/10 text-accent-blue">
              <Settings size={18} />
            </span>
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Settings &amp; Workstation Preferences
            </h1>
            <span className="text-[10px] bg-accent-green/10 text-accent-green border border-accent-green/30 px-2 py-0.5 rounded font-semibold uppercase flex items-center gap-1">
              <ShieldCheck size={11} /> System Online
            </span>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Configure scan thresholds, customize visual themes, set workspace density, manage broker integration, and control alert triggers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="bg-bg-tertiary hover:bg-accent-red/20 text-accent-red border border-accent-red/30 px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <LogOut size={13} />
            <span>{loggingOut ? 'Logging out...' : 'Log out'}</span>
          </Button>
          <Button
            type="button"
            onClick={handleSaveSettings}
            disabled={saving}
            className="bg-accent-blue hover:bg-accent-blue/90 text-white font-bold px-4 py-1.5 rounded-md text-xs transition-colors flex items-center gap-1.5 shadow-sm"
          >
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
          </Button>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-4">
        {/* ── Section 1: Workspace Appearance & 5 Themes ── */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border-primary pb-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-accent-blue/10 text-accent-blue">
                <Palette size={14} />
              </span>
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Workstation Visual Themes
              </h2>
            </div>
            <span className="text-[10px] text-text-tertiary">
              Active: <strong className="text-text-primary uppercase">{theme}</strong>
            </span>
          </div>

          <p className="text-xs text-text-tertiary">
            Institutional color palettes built with semantic CSS tokens. Instantly updates the entire terminal and persists across sessions.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {themeOptions.map((opt) => {
              const isSelected = opt.id === theme;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTheme(opt.id)}
                  className={`text-left p-3 rounded-lg border transition-all relative ${
                    isSelected
                      ? 'border-accent-blue bg-accent-blue/10 ring-1 ring-accent-blue shadow-sm'
                      : 'border-border-primary bg-bg-tertiary hover:bg-bg-secondary hover:border-border-secondary'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {opt.id === 'light-pro' && <Sun size={14} className="text-accent-amber" />}
                      {opt.id === 'dark-oled' && <Moon size={14} className="text-accent-blue" />}
                      {opt.id === 'high-contrast' && <Eye size={14} className="text-accent-green" />}
                      {opt.id === 'system' && <Monitor size={14} className="text-text-tertiary" />}
                      {opt.id === 'dark-pro' && <Moon size={14} className="text-accent-purple" />}
                      <span className="font-bold text-text-primary text-xs">{opt.name}</span>
                    </div>
                    {isSelected ? (
                      <Check size={14} className="text-accent-blue" />
                    ) : opt.badge ? (
                      <span className="text-[8px] px-1.5 py-0.2 rounded font-bold uppercase bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                        {opt.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[10px] text-text-tertiary leading-snug">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Section 2: Table Density & Display Preferences ── */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border-primary pb-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-accent-amber/10 text-accent-amber">
                <Table size={14} />
              </span>
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Workstation Density &amp; View Defaults
              </h2>
            </div>
            <span className="text-[10px] text-text-tertiary">Table Presentation</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-text-secondary uppercase">
                Default Workspace Table Density
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDensityChange('compact')}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    defaultDensity === 'compact'
                      ? 'bg-accent-blue/10 border-accent-blue text-text-primary font-bold'
                      : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Compact (Dense)</span>
                    {defaultDensity === 'compact' && <CheckCircle2 size={13} className="text-accent-blue" />}
                  </div>
                  <p className="text-[10px] text-text-tertiary mt-1">
                    32px row height. Optimized for multi-monitor institutional trade desks.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleDensityChange('comfortable')}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    defaultDensity === 'comfortable'
                      ? 'bg-accent-blue/10 border-accent-blue text-text-primary font-bold'
                      : 'bg-bg-tertiary border-border-primary text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Detailed (Comfortable)</span>
                    {defaultDensity === 'comfortable' && <CheckCircle2 size={13} className="text-accent-blue" />}
                  </div>
                  <p className="text-[10px] text-text-tertiary mt-1">
                    44px row height. Enhanced readability for touchscreen or laptop displays.
                  </p>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-text-secondary uppercase">
                Navigation &amp; Cache Behavior
              </label>
              <div className="bg-bg-tertiary border border-border-primary rounded-lg p-3 space-y-2 text-text-secondary">
                <div className="flex items-center justify-between">
                  <span className="text-xs">Quick Search Palette</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border-primary text-[10px] font-mono text-text-tertiary">
                    Ctrl + K
                  </kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">Drill-Down Stock Drawer</span>
                  <span className="text-[10px] text-accent-green font-bold">Enabled</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">Session Memory Cache</span>
                  <span className="text-[10px] text-accent-green font-bold">Zero-Latency Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 3: Market Telemetry Setup ── */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border-primary pb-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-accent-blue/10 text-accent-blue">
                <Sliders size={14} />
              </span>
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Market Telemetry Setup
              </h2>
            </div>
            <span className="text-[10px] text-text-tertiary">Data Ingestion Engine</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Market Data Feed Mode */}
            <div className="space-y-1.5">
              <label className="text-text-secondary font-semibold uppercase flex items-center gap-1">
                <Database size={12} className="text-accent-blue" />
                Market Feed Mode
              </label>
              <select
                value={marketMode}
                onChange={(e) => setMarketMode(e.target.value)}
                className="bg-bg-tertiary border border-border-primary text-text-primary w-full p-2 rounded-md focus:outline-none focus:border-accent-blue"
              >
                <option value="live">Live (Yahoo Finance Real-time)</option>
                <option value="paper">Paper (Simulated Tick Fluctuations)</option>
                <option value="mock">Mock (Static Test Vectors)</option>
              </select>
              <p className="text-[10px] text-text-tertiary">
                Requires server internet connectivity to query finance APIs.
              </p>
            </div>

            {/* Default Universe */}
            <div className="space-y-1.5">
              <label className="text-text-secondary font-semibold uppercase flex items-center gap-1">
                <Cpu size={12} className="text-accent-purple" />
                Default Target Universe
              </label>
              <select
                value={defaultUniverse}
                onChange={(e) => setDefaultUniverse(e.target.value)}
                className="bg-bg-tertiary border border-border-primary text-text-primary w-full p-2 rounded-md focus:outline-none focus:border-accent-blue"
              >
                <option value="NSE_FNO">NSE F&amp;O (~202 Stocks)</option>
                <option value="NIFTY50">Nifty 50 Index</option>
                <option value="NIFTY100">Nifty 100 Index</option>
                <option value="NIFTY200">Nifty 200 Index</option>
                <option value="ALL_NSE">All Covered Symbols</option>
              </select>
              <p className="text-[10px] text-text-tertiary">
                Initial universe loaded upon navigating to the Scanner workspace.
              </p>
            </div>

            {/* Auto Refresh Interval */}
            <div className="space-y-1.5">
              <label className="text-text-secondary font-semibold uppercase flex items-center gap-1">
                <Play size={12} className="text-accent-green" />
                Auto-Refresh Interval
              </label>
              <select
                value={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.value)}
                className="bg-bg-tertiary border border-border-primary text-text-primary w-full p-2 rounded-md focus:outline-none focus:border-accent-blue"
              >
                <option value="off">Off (Manual Sync Only)</option>
                <option value="5m">Every 5 Minutes</option>
                <option value="15m">Every 15 Minutes</option>
                <option value="30m">Every 30 Minutes</option>
              </select>
              <p className="text-[10px] text-text-tertiary">
                Periodic background interval for refreshing live scanner metrics.
              </p>
            </div>
          </div>

          {/* Bypass BTST/STBT Time Lock */}
          <div className="pt-2 border-t border-border-primary/50">
            <label className="flex items-start gap-2 cursor-pointer text-text-secondary font-semibold select-none">
              <input
                type="checkbox"
                checked={bypassBtst}
                onChange={(e) => setBypassBtst(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-border-primary bg-bg-tertiary accent-accent-blue cursor-pointer"
              />
              <div>
                <span className="text-text-primary">Bypass BTST Time Lock (Research Mode)</span>
                <p className="text-[10px] font-normal text-text-tertiary mt-0.5 leading-relaxed">
                  Permits the Scanner to evaluate BTST/STBT setups outside the standard 15:10–15:25 IST window. Does NOT alter journal execution, Telegram alerts, or regime-gated cron jobs.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* ── Section 4: Discovery Filter Constraints ── */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border-primary pb-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-accent-amber/10 text-accent-amber">
                <Sliders size={14} />
              </span>
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Discovery Filter Constraints
              </h2>
            </div>
            <span className="text-[10px] text-text-tertiary">Risk Floors</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-text-secondary font-semibold uppercase">
                Price Floor Limit (₹)
              </label>
              <input
                type="number"
                min="1"
                step="0.5"
                value={minPrice}
                onChange={(e) => setMinPrice(parseFloat(e.target.value) || 1)}
                className="bg-bg-tertiary border border-border-primary text-text-primary w-full p-2 rounded-md focus:outline-none focus:border-accent-blue"
              />
              <p className="text-[10px] text-text-tertiary">
                Excludes penny counters below this price limit during scans.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-text-secondary font-semibold uppercase">
                Volume Floor Limit (Daily Shares)
              </label>
              <input
                type="number"
                min="1000"
                step="1000"
                value={minVolume}
                onChange={(e) => setMinVolume(parseInt(e.target.value) || 1000)}
                className="bg-bg-tertiary border border-border-primary text-text-primary w-full p-2 rounded-md focus:outline-none focus:border-accent-blue"
              />
              <p className="text-[10px] text-text-tertiary">
                Excludes illiquid stocks with daily volume below this threshold.
              </p>
            </div>
          </div>
        </div>

        {/* ── Section 5: Broker Integration (Fyers API) ── */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border-primary pb-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-accent-green/10 text-accent-green">
                <Cpu size={14} />
              </span>
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Broker Feed Integration (Fyers)
              </h2>
            </div>
            <span className="text-[10px] text-text-tertiary">Quotes &amp; Option Chains</span>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-bg-tertiary border border-border-primary rounded-lg p-3">
            <div>
              <span className="block text-[10px] font-bold text-text-tertiary uppercase tracking-wider mb-1">
                Fyers API Session Status
              </span>
              {fyersLoading ? (
                <span className="text-text-tertiary animate-pulse">Probing broker API status...</span>
              ) : fyersConnected ? (
                <span className="text-accent-green font-bold flex items-center gap-1">
                  <CheckCircle2 size={13} /> Connected &amp; Authenticated (Expires: {fyersExpiry})
                </span>
              ) : (
                <span className="text-accent-red font-bold flex items-center gap-1">
                  <AlertCircle size={13} /> Disconnected — Daily OAuth Token Expired
                </span>
              )}
            </div>

            <Button
              type="button"
              onClick={() => {
                window.location.href = '/api/broker/fyers/login';
              }}
              className="bg-accent-blue hover:bg-accent-blue/90 text-white font-bold px-3 py-1.5 rounded-md text-xs transition-colors shrink-0"
            >
              {fyersConnected ? 'Reconnect Fyers Session' : 'Authenticate Fyers Account'}
            </Button>
          </div>

          {fyersConnected && fyersDataApiOk === false && (
            <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/10 p-3 text-xs text-accent-amber space-y-1">
              <p className="font-bold flex items-center gap-1">
                <AlertCircle size={13} /> Data API Permission Missing
              </p>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Login succeeded, but Quotes/History returned permission denied. The live scanner will use Yahoo fallback until permissions are enabled on <span className="font-mono font-bold text-text-primary">myapi.fyers.in</span>.
              </p>
              {fyersDataApiMessage && (
                <p className="text-[10px] font-mono text-accent-amber/80 break-words">{fyersDataApiMessage}</p>
              )}
            </div>
          )}

          {fyersConnected && fyersDataApiOk === true && (
            <p className="text-[10px] text-accent-green font-semibold">
              ✓ Data API probe validated — Fyers Quotes &amp; Historical candle streams are active.
            </p>
          )}

          <p className="text-[10px] text-text-tertiary">
            Fyers API access tokens expire every 24 hours per SEBI compliance. Re-authenticate once daily to enable real-time F&amp;O option suggestions.
          </p>
        </div>

        {/* ── Section 6: Telegram Alerts Configuration ── */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border-primary pb-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-accent-blue/10 text-accent-blue">
                <Send size={14} />
              </span>
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Telegram Alerts &amp; Notifications
              </h2>
            </div>
            <span className="text-[10px] text-text-tertiary">Instant Push Notifications</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-text-secondary font-semibold uppercase">
                Bot Token
              </label>
              <input
                type="password"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                onFocus={() => {
                  if (looksMaskedSecret(telegramToken)) setTelegramToken('');
                }}
                className="bg-bg-tertiary border border-border-primary text-text-primary w-full p-2 rounded-md focus:outline-none focus:border-accent-blue"
                placeholder="123456789:ABCDefgh..."
              />
              <p className="text-[10px] text-text-tertiary">
                Requires server .env update to permanently bind. Stored here as workstation preference.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-text-secondary font-semibold uppercase">
                Direct Chat ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  onFocus={() => {
                    if (looksMaskedSecret(telegramChatId)) setTelegramChatId('');
                  }}
                  className="bg-bg-tertiary border border-border-primary text-text-primary flex-1 p-2 rounded-md focus:outline-none focus:border-accent-blue"
                  placeholder="-10012345678"
                />
                <Button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={telegramTesting}
                  className="bg-bg-tertiary hover:bg-border-primary text-text-primary border border-border-primary px-3 py-1.5 rounded-md text-xs font-bold transition-colors shrink-0"
                >
                  {telegramTesting ? 'Testing...' : 'Test Alert'}
                </Button>
              </div>
            </div>

            {/* Breakout Alert Group Chat ID */}
            <div className="md:col-span-2 space-y-1.5 pt-2 border-t border-border-primary/50">
              <label className="text-text-secondary font-semibold uppercase">
                Breakout Alert Group Chat ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="telegram-group-chat-id"
                  value={telegramGroupChatId}
                  onChange={(e) => setTelegramGroupChatId(e.target.value)}
                  onFocus={() => {
                    if (looksMaskedSecret(telegramGroupChatId)) setTelegramGroupChatId('');
                  }}
                  className="bg-bg-tertiary border border-border-primary text-text-primary flex-1 p-2 rounded-md focus:outline-none focus:border-accent-blue"
                  placeholder="-100xxxxxxxxxx"
                />
                <Button
                  type="button"
                  id="test-breakout-alert-btn"
                  onClick={handleTestBreakoutAlert}
                  disabled={breakoutTesting}
                  className="bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue border border-accent-blue/30 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shrink-0"
                >
                  {breakoutTesting ? 'Sending...' : '⚡ Test Breakout Alert'}
                </Button>
              </div>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                Sends automated alerts when the CPR Scanner detects a qualified Breakout setup (Narrow CPR + Volume Spike + Price &gt; TC). Deduplication ensures only fresh breakout occurrences are broadcast.
              </p>
            </div>
          </div>
        </div>

        {/* ── Section 7: Institutional Keyboard Shortcuts Reference ── */}
        <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border-primary pb-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-accent-purple/10 text-accent-purple">
                <Keyboard size={14} />
              </span>
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Keyboard Shortcuts Reference
              </h2>
            </div>
            <span className="text-[10px] text-text-tertiary">Productivity Accelerators</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-text-secondary">
            <div className="bg-bg-tertiary border border-border-primary rounded-md p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary">Command Palette</span>
                <kbd className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border-primary text-[9px] font-mono text-text-tertiary">
                  Ctrl + K
                </kbd>
              </div>
              <p className="text-[10px] text-text-tertiary">Global quick-jump navigation</p>
            </div>

            <div className="bg-bg-tertiary border border-border-primary rounded-md p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary">Close Drawer / Modal</span>
                <kbd className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border-primary text-[9px] font-mono text-text-tertiary">
                  Esc
                </kbd>
              </div>
              <p className="text-[10px] text-text-tertiary">Dismiss open drawer panel</p>
            </div>

            <div className="bg-bg-tertiary border border-border-primary rounded-md p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary">Refresh Data</span>
                <kbd className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border-primary text-[9px] font-mono text-text-tertiary">
                  R
                </kbd>
              </div>
              <p className="text-[10px] text-text-tertiary">Rescan active workspace</p>
            </div>

            <div className="bg-bg-tertiary border border-border-primary rounded-md p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary">Symbol Search</span>
                <kbd className="px-1.5 py-0.5 rounded bg-bg-secondary border border-border-primary text-[9px] font-mono text-text-tertiary">
                  /
                </kbd>
              </div>
              <p className="text-[10px] text-text-tertiary">Focus table search bar</p>
            </div>
          </div>
        </div>

        {/* ── Footer Action Bar ── */}
        <div className="flex items-center justify-between p-2">
          <Button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="bg-bg-tertiary hover:bg-accent-red/20 text-accent-red border border-accent-red/30 px-4 py-2 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <LogOut size={13} />
            <span>{loggingOut ? 'Logging out...' : 'Log out'}</span>
          </Button>

          <Button
            type="submit"
            disabled={saving}
            className="bg-accent-blue hover:bg-accent-blue/90 text-white font-bold px-5 py-2 rounded-md text-xs transition-colors flex items-center gap-1.5 shadow-sm"
          >
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
            <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
