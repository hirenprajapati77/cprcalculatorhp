'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Save, Sparkles, Sliders, Play, Database, ShieldAlert, Cpu } from 'lucide-react';
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
  }, []);

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
