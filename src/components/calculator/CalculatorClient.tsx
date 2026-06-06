'use client';

import React, { useState, useEffect } from 'react';
import { CalculatorForm } from '@/components/calculator/CalculatorForm';
import { ResultsPanel } from '@/components/calculator/ResultsPanel';
import { AnalysisPanel } from '@/components/calculator/AnalysisPanel';
import { LevelChart } from '@/components/chart/LevelChart';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { CalculationRecord, CPRInput } from '@/types/cpr.types';
import { exportToCSV } from '@/lib/export';
import { fmt, formatPct } from '@/utils/format';
import { Share2, Check } from 'lucide-react';

export default function CalculatorClient() {
  const [record, setRecord] = useState<CalculationRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const { showToast } = useToast();

  // Load the last calculation from sessionStorage if it exists
  useEffect(() => {
    const cached = sessionStorage.getItem('cpr_last_calculation');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        parsed.createdAt = new Date(parsed.createdAt);
        setRecord(parsed);
        setIsSaved(sessionStorage.getItem('cpr_last_saved') === 'true');
      } catch (err) {
        console.error('Failed to load session cached calculation:', err);
      }
    }
  }, []);

  const handleCalculate = async (input: CPRInput) => {
    setIsLoading(true);
    setIsSaved(false);
    try {
      const res = await fetch('/api/cpr/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to calculate levels');
      }

      const data: CalculationRecord = await res.json();
      data.createdAt = new Date(data.createdAt);
      
      setRecord(data);
      sessionStorage.setItem('cpr_last_calculation', JSON.stringify(data));
      sessionStorage.setItem('cpr_last_saved', 'false');
      showToast('CPR Levels calculated successfully!', 'success');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Calculation error';
      showToast(errMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setRecord(null);
    setIsSaved(false);
    sessionStorage.removeItem('cpr_last_calculation');
    sessionStorage.removeItem('cpr_last_saved');
    showToast('Form and levels reset.', 'info');
  };

  const handleSaveSession = () => {
    if (!record) return;
    setIsSaving(true);

    try {
      // Sync with localStorage history list (dual-storage fallback)
      const rawHistory = localStorage.getItem('cpr_history') || '[]';
      let historyList: CalculationRecord[] = [];
      try {
        historyList = JSON.parse(rawHistory);
      } catch {
        historyList = [];
      }

      // Check if session is already saved in history list
      const exists = historyList.some((h) => h.id === record.id || (h.high === record.high && h.low === record.low && h.close === record.close));
      
      if (!exists) {
        historyList.unshift(record);
        // Cap history at 50 records
        if (historyList.length > 50) {
          historyList = historyList.slice(0, 50);
        }
        localStorage.setItem('cpr_history', JSON.stringify(historyList));
      }

      setIsSaved(true);
      sessionStorage.setItem('cpr_last_saved', 'true');
      showToast('Session saved to history!', 'success');
    } catch {
      showToast('Failed to save calculation session', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyLevels = () => {
    if (!record) return;

    const shareUrl = record.shareToken 
      ? `${window.location.origin}/share/${record.shareToken}`
      : 'URL unavailable';

    const text = `CPR PRO PLATFORM REPORT\n` +
      `---------------------------\n` +
      `Inputs:\n` +
      `  High: ${fmt(record.high)}\n` +
      `  Low: ${fmt(record.low)}\n` +
      `  Close: ${fmt(record.close)}\n\n` +
      `Calculated Levels:\n` +
      `  Pivot Point: ${fmt(record.pivot)}\n` +
      `  Top Central (TC): ${fmt(record.tc)}\n` +
      `  Bottom Central (BC): ${fmt(record.bc)}\n` +
      `  Resistance R1: ${fmt(record.r1)} | R2: ${fmt(record.r2)} | R3: ${fmt(record.r3)} | R4: ${fmt(record.r4)}\n` +
      `  Support S1: ${fmt(record.s1)} | S2: ${fmt(record.s2)} | S3: ${fmt(record.s3)} | S4: ${fmt(record.s4)}\n\n` +
      `Metrics:\n` +
      `  Width: ${formatPct(record.width)}\n` +
      `  Type: ${record.classification}\n` +
      `  Bias: ${record.trend}\n\n` +
      `Public Share Link: ${shareUrl}`;

    navigator.clipboard.writeText(text).then(
      () => showToast('Levels copied to clipboard!', 'success'),
      () => showToast('Failed to copy levels', 'error')
    );
  };

  const handleExportCSV = () => {
    if (!record) return;
    try {
      const csv = exportToCSV(record);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `cpr_report_${record.shareToken || Date.now()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('CSV report downloaded.', 'success');
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-5 font-mono relative overflow-hidden select-none">
        <div className="absolute top-0 right-0 h-full w-1/3 opacity-[0.03] pointer-events-none select-none">
          <Share2 className="h-full w-full stroke-[0.5]" />
        </div>
        <div className="relative z-10 space-y-1">
          <span className="text-[10px] text-accent-blue font-bold uppercase tracking-widest flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-blue animate-pulse" />
            Quant Trading Terminal
          </span>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary uppercase">
            Central Pivot Range System
          </h1>
          <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
            Generate institutional CPR levels to forecast daily breakout thresholds, detect range bounds, and predict intraday directional momentum.
          </p>
        </div>
      </div>

      {/* Main Terminal Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (Inputs and Levels) */}
        <div className="lg:col-span-5 space-y-5">
          <CalculatorForm
            onCalculate={handleCalculate}
            onReset={handleReset}
            isLoading={isLoading}
          />
          
          <ResultsPanel result={record} />
        </div>

        {/* Right Column (Analysis and Visualization) */}
        <div className="lg:col-span-7 space-y-5">
          <AnalysisPanel
            record={record}
            onSave={handleSaveSession}
            isSaving={isSaving}
            onCopy={handleCopyLevels}
            onExportCSV={handleExportCSV}
            isSaved={isSaved}
          />

          <LevelChart record={record} />
        </div>
      </div>

      {/* Public Share Link Card (If calculated) */}
      {record && record.shareToken && (
        <div className="bg-bg-secondary/40 border border-border-primary/80 rounded-lg p-4 font-mono text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fade-in">
          <div className="space-y-1">
            <span className="font-semibold text-text-primary flex items-center gap-1.5">
              <Check size={14} className="text-accent-green" />
              Public Calculation URL Generated
            </span>
            <p className="text-text-secondary text-[11px] leading-relaxed">
              Share this unique, read-only dashboard. Anyone can access the calculations, level bands, and analysis charts.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/share/${record.shareToken}`}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="bg-bg-secondary border border-border-secondary px-3 py-1.5 rounded text-text-primary w-full md:w-[280px] focus:outline-none focus:border-accent-blue"
            />
            <Button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/share/${record.shareToken}`);
                showToast('Link copied to clipboard!', 'success');
              }}
              size="sm"
              variant="primary"
              className="whitespace-nowrap"
            >
              Copy Link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
