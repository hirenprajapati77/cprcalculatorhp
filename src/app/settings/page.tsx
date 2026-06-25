'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Save, Sliders, Play, Database, Cpu, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

export default function SettingsPage() {
  const [marketMode, setMarketMode] = useState<string>('live');
  const [defaultUniverse, setDefaultUniverse] = useState<string>('NSE_FNO');
  const [autoRefresh, setAutoRefresh] = useState<string>('15m');
  const [minPrice, setMinPrice] = useState<number>(20);
  const [minVolume, setMinVolume] = useState<number>(50000);
  const [saving, setSaving] = useState<boolean>(false);
  const [telegramToken, setTelegramToken] = useState<string>('');
  const [telegramChatId, setTelegramChatId] = useState<string>('');
  const [telegramGroupChatId, setTelegramGroupChatId] = useState<string>('');
  const [telegramTesting, setTelegramTesting] = useState<boolean>(false);
  const [breakoutTesting, setBreakoutTesting] = useState<boolean>(false);
  const [bypassBtst, setBypassBtst] = useState<boolean>(false);
  const [fyersConnected, setFyersConnected] = useState<boolean>(false);
  const [fyersExpiry, setFyersExpiry] = useState<string>('');
  const [fyersLoading, setFyersLoading] = useState<boolean>(true);
  const { showToast } = useToast();

  // Load settings from localStorage on mount
  useEffect(() => {
    const localMode = localStorage.getItem('cpr_settings_market_mode') || 'live';
    const localUniv = localStorage.getItem('cpr_settings_default_universe') || 'NSE_FNO';
    const localRefresh = localStorage.getItem('cpr_settings_auto_refresh') || '15m';
    const localMinPrice = parseFloat(localStorage.getItem('cpr_settings_min_price') || '20');
    const localMinVol = parseInt(localStorage.getItem('cpr_settings_min_volume') || '50000');

    setMarketMode(localMode);
    setDefaultUniverse(localUniv);
    setAutoRefresh(localRefresh);
    setMinPrice(localMinPrice);
    setMinVolume(localMinVol);
    setBypassBtst(localStorage.getItem('cpr_settings_bypass_btst') === 'true');
    setTelegramToken(localStorage.getItem('cpr_settings_telegram_token') || '');
    setTelegramChatId(localStorage.getItem('cpr_settings_telegram_chat_id') || '');
    setTelegramGroupChatId(localStorage.getItem('cpr_settings_telegram_group_chat_id') || '');
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
          } else {
            setFyersConnected(false);
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
        body: JSON.stringify({ test: true })
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
        body: JSON.stringify({ test: true, groupChatId: telegramGroupChatId })
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

  // Save settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      localStorage.setItem('cpr_settings_market_mode', marketMode);
      localStorage.setItem('cpr_settings_default_universe', defaultUniverse);
      localStorage.setItem('cpr_settings_auto_refresh', autoRefresh);
      localStorage.setItem('cpr_settings_min_price', minPrice.toString());
      localStorage.setItem('cpr_settings_min_volume', minVolume.toString());
      localStorage.setItem('cpr_settings_telegram_token', telegramToken);
      localStorage.setItem('cpr_settings_telegram_chat_id', telegramChatId);
      localStorage.setItem('cpr_settings_telegram_group_chat_id', telegramGroupChatId);
      localStorage.setItem('cpr_settings_bypass_btst', bypassBtst ? 'true' : 'false');
      
      showToast('Settings profiles updated successfully', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to write settings profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 py-6 font-mono text-xs text-slate-300">
      {/* Title Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl relative overflow-hidden select-none">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Settings size={120} className="text-slate-500 rotate-12" />
        </div>
        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
          <Settings size={13} className="text-blue-400 animate-spin-slow" />
          Quant Engine Control Panel
        </span>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white uppercase mt-1">
          Settings & Configurations
        </h1>
        <p className="text-[11px] text-slate-400 max-w-2xl leading-relaxed mt-2">
          Configure scanning thresholds, set default filter universe limits, adjust auto-refresh telemetry intervals, and toggle data-source feeds.
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        <Card title="Market Telemetry Setup" icon={<Sliders size={14} className="text-blue-400" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
            
            {/* Market Data Feed Mode */}
            <div className="space-y-2">
              <label className="text-slate-400 font-semibold uppercase flex items-center gap-1">
                <Database size={13} />
                Market Feed Mode
              </label>
              <select
                value={marketMode}
                onChange={(e) => setMarketMode(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-white w-full p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="live">Live (Yahoo Finance Real-time)</option>
                <option value="paper">Paper (Simulated Tick Fluctuations)</option>
                <option value="mock">Mock (Static Test Vectors)</option>
              </select>
              <p className="text-[9px] text-slate-500 mt-1">
                Note: In live mode, ensure your server environment has valid internet access to query finance APIs.
              </p>
            </div>

            {/* Default Universe */}
            <div className="space-y-2">
              <label className="text-slate-400 font-semibold uppercase flex items-center gap-1">
                <Cpu size={13} />
                Default Target Universe
              </label>
              <select
                value={defaultUniverse}
                onChange={(e) => setDefaultUniverse(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-white w-full p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="NSE_FNO">NSE F&O (~202 Stocks)</option>
                <option value="NIFTY50">Nifty 50 Index</option>
                <option value="NIFTY100">Nifty 100 Index</option>
                <option value="NIFTY200">Nifty 200 Index</option>
                <option value="ALL_NSE">All Covered Symbols</option>
              </select>
              <p className="text-[9px] text-slate-500 mt-1">
                Defines the preset loaded on loading the main Quant Discovery terminal.
              </p>
            </div>

            {/* Auto Refresh Interval */}
            <div className="space-y-2">
              <label className="text-slate-400 font-semibold uppercase flex items-center gap-1">
                <Play size={13} />
                Auto-Refresh Telemetry
              </label>
              <select
                value={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-white w-full p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="off">Off (Manual Sync)</option>
                <option value="5m">Every 5 Minutes</option>
                <option value="15m">Every 15 Minutes</option>
                <option value="30m">Every 30 Minutes</option>
              </select>
              <p className="text-[9px] text-slate-500 mt-1">
                Trigger interval for querying live feeds and updating cached discovery metrics.
              </p>
            </div>

            {/* Bypass BTST/STBT Time Lock */}
            <div className="space-y-2 flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-slate-400 font-semibold select-none">
                <input
                  type="checkbox"
                  checked={bypassBtst}
                  onChange={(e) => setBypassBtst(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-800 bg-slate-950 focus:ring-blue-500 accent-blue cursor-pointer"
                />
                <span>Bypass BTST Time Lock (Run Scan Anywhere/Anytime)</span>
              </label>
            </div>
          </div>
        </Card>

        <Card title="Discovery Filter Constraints" icon={<Sliders size={14} className="text-amber-500" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
            
            {/* Price Floor Threshold */}
            <div className="space-y-2">
              <label className="text-slate-400 font-semibold uppercase">
                Price Floor Limit (₹)
              </label>
              <input
                type="number"
                min="1"
                step="0.5"
                value={minPrice}
                onChange={(e) => setMinPrice(parseFloat(e.target.value) || 1)}
                className="bg-slate-950 border border-slate-800 text-white w-full p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <p className="text-[9px] text-slate-500 mt-1">
                Excludes penny stocks below this floor threshold during scans.
              </p>
            </div>

            {/* Volume Floor Threshold */}
            <div className="space-y-2">
              <label className="text-slate-400 font-semibold uppercase">
                Volume Floor Limit (Daily Shares)
              </label>
              <input
                type="number"
                min="1000"
                step="1000"
                value={minVolume}
                onChange={(e) => setMinVolume(parseInt(e.target.value) || 1000)}
                className="bg-slate-950 border border-slate-800 text-white w-full p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <p className="text-[9px] text-slate-500 mt-1">
                Excludes illiquid counters with volume below this floor threshold.
              </p>
            </div>
          </div>
        </Card>

        <Card title="Broker Integration" icon={<Cpu size={14} className="text-emerald-500" />}>
          <div className="p-4 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">Fyers API Connection</span>
                {fyersLoading ? (
                  <span className="text-slate-500 animate-pulse">Checking status...</span>
                ) : fyersConnected ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    ✅ Connected (Expires: {fyersExpiry})
                  </span>
                ) : (
                  <span className="text-rose-500 font-bold">
                    🔴 Not connected
                  </span>
                )}
              </div>
              <Button
                type="button"
                onClick={() => {
                  window.location.href = '/api/broker/fyers/login';
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase"
              >
                {fyersConnected ? 'Reconnect Fyers Account' : 'Connect Fyers Account'}
              </Button>
            </div>
            <p className="text-[9px] text-slate-500 leading-normal">
              Fyers API authentication token expires every 24 hours. Ensure you click to connect and authorize daily to enable real-time F&O option suggestions.
            </p>
          </div>
        </Card>

        <Card title="Telegram Alerts Configuration" icon={<Send size={14} className="text-blue-500" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                Bot Token
              </label>
              <input
                type="password"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                className="w-full bg-bg-secondary/40 border border-border-primary rounded focus:ring-1 focus:ring-accent-blue focus:border-accent-blue text-sm px-3 py-2 text-text-primary transition-all outline-none"
                placeholder="123456789:ABCDefgh..."
              />
              <p className="text-[10px] text-text-tertiary mt-1">Requires server .env update to fully apply. This just stores preference.</p>
            </div>
            
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                Chat ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="flex-1 bg-bg-secondary/40 border border-border-primary rounded focus:ring-1 focus:ring-accent-blue focus:border-accent-blue text-sm px-3 py-2 text-text-primary transition-all outline-none"
                  placeholder="-10012345678"
                />
                <Button 
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={telegramTesting}
                  className="bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary px-3 py-2 rounded text-xs"
                >
                  {telegramTesting ? 'Testing...' : 'Test Alert'}
                </Button>
              </div>
            </div>

            {/* Breakout Alert Group Chat ID */}
            <div className="md:col-span-2 space-y-1.5 border-t border-slate-700/50 pt-4 mt-2">
              <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                Breakout Alert Group Chat ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="telegram-group-chat-id"
                  value={telegramGroupChatId}
                  onChange={(e) => setTelegramGroupChatId(e.target.value)}
                  className="flex-1 bg-bg-secondary/40 border border-border-primary rounded focus:ring-1 focus:ring-accent-blue focus:border-accent-blue text-sm px-3 py-2 text-text-primary transition-all outline-none"
                  placeholder="-100xxxxxxxxxx"
                />
                <Button
                  type="button"
                  id="test-breakout-alert-btn"
                  onClick={handleTestBreakoutAlert}
                  disabled={breakoutTesting}
                  className="bg-blue-900/40 hover:bg-blue-800/60 text-blue-300 border border-blue-700/40 px-3 py-2 rounded text-xs font-bold whitespace-nowrap"
                >
                  {breakoutTesting ? 'Sending...' : '⚡ Test Breakout Alert'}
                </Button>
              </div>
              <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">
                Receives real-time alerts when CPR Scanner detects a NEW BREAKOUT signal (NARROW CPR + Volume Spike + Price &gt; TC).
                Deduplication: alerts only on NEW occurrences, not repeated on every scan.
                To get your group ID: add bot to group → send any message → visit
                <code className="text-blue-400 mx-1 break-all">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>
                → copy <code className="text-blue-400">&apos;chat&apos;:&apos;id&apos;</code> value (starts with -100).
                Set <code className="text-blue-400">TELEGRAM_GROUP_CHAT_ID</code> in server .env to activate.
              </p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end p-2">
          <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl h-10 flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs">
            <Save size={14} />
            Save Configuration
          </Button>
        </div>
      </form>
    </div>
  );
}
