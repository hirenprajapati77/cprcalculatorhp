'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { CalculationRecord } from '@/types/cpr.types';
import { ResultsPanel } from '@/components/calculator/ResultsPanel';
import { AnalysisPanel } from '@/components/calculator/AnalysisPanel';
import { LevelChart } from '@/components/chart/LevelChart';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { exportToCSV } from '@/lib/export';
import { fmt, formatDate } from '@/utils/format';
import { Share2, ArrowLeft, ArrowUpRight, Award } from 'lucide-react';

interface ShareClientProps {
  record: CalculationRecord;
}

export const ShareClient: React.FC<ShareClientProps> = ({ record }) => {
  const router = useRouter();
  const { showToast } = useToast();

  const handleImportToCalculator = () => {
    // Pre-cache inputs in sessionStorage to auto-populate the main calculator
    sessionStorage.setItem('cpr_last_calculation', JSON.stringify(record));
    sessionStorage.setItem('cpr_last_saved', 'true');
    showToast('Imported shared session! Redirecting...', 'success');
    router.push('/calculate');
  };

  const handleCopyLevels = () => {
    const text = `CPR PRO SHARED REPORT\n` +
      `---------------------------\n` +
      `Saved At: ${formatDate(record.createdAt)}\n` +
      `Inputs:\n` +
      `  High: ${fmt(record.high)}\n` +
      `  Low: ${fmt(record.low)}\n` +
      `  Close: ${fmt(record.close)}\n\n` +
      `Calculated Levels:\n` +
      `  Pivot Point: ${fmt(record.pivot)}\n` +
      `  TC: ${fmt(record.tc)} | BC: ${fmt(record.bc)}\n` +
      `  R1: ${fmt(record.r1)} | R2: ${fmt(record.r2)} | R3: ${fmt(record.r3)} | R4: ${fmt(record.r4)}\n` +
      `  S1: ${fmt(record.s1)} | S2: ${fmt(record.s2)} | S3: ${fmt(record.s3)} | S4: ${fmt(record.s4)}\n\n` +
      `Metrics:\n` +
      `  Width: ${record.width.toFixed(3)}%\n` +
      `  Type: ${record.classification}\n` +
      `  Bias: ${record.trend}`;

    navigator.clipboard.writeText(text).then(
      () => showToast('Shared levels copied to clipboard!', 'success'),
      () => showToast('Failed to copy levels', 'error')
    );
  };

  const handleExportCSV = () => {
    try {
      const csv = exportToCSV(record);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `cpr_shared_report_${record.shareToken}.csv`);
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
      {/* Title Header */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-5 font-mono flex flex-col md:flex-row justify-between items-start md:items-center gap-4 select-none">
        <div className="space-y-1">
          <span className="text-[10px] text-accent-amber font-bold uppercase tracking-widest flex items-center gap-1.5">
            <Share2 size={13} />
            Shared Session View
          </span>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary uppercase">
            CPR Analysis Report
          </h1>
          <p className="text-xs text-text-secondary">
            Generated on {formatDate(record.createdAt)} &bull; Share Token: {record.shareToken}
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button onClick={() => router.push('/calculate')} variant="ghost" size="sm" className="flex-1 md:flex-none">
            <ArrowLeft size={13} />
            Calculator Home
          </Button>
          <Button onClick={handleImportToCalculator} variant="primary" size="sm" className="flex-grow md:flex-none">
            <ArrowUpRight size={13} />
            Load in Calculator
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left column (Shared inputs + calculated levels) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Static inputs display card */}
          <Card title="input parameters" icon={<Award size={14} className="text-accent-blue" />}>
            <div className="grid grid-cols-3 gap-2.5 font-mono text-center">
              <div className="bg-bg-secondary p-2.5 rounded border border-border-primary">
                <div className="text-[9px] text-text-tertiary uppercase mb-1">High</div>
                <div className="text-sm font-semibold text-text-primary">{fmt(record.high)}</div>
              </div>
              <div className="bg-bg-secondary p-2.5 rounded border border-border-primary">
                <div className="text-[9px] text-text-tertiary uppercase mb-1">Low</div>
                <div className="text-sm font-semibold text-text-primary">{fmt(record.low)}</div>
              </div>
              <div className="bg-bg-secondary p-2.5 rounded border border-border-primary">
                <div className="text-[9px] text-text-tertiary uppercase mb-1">Close</div>
                <div className="text-sm font-semibold text-text-primary">{fmt(record.close)}</div>
              </div>
            </div>
          </Card>
          
          <ResultsPanel result={record} />
        </div>

        {/* Right column (Analysis + charts) */}
        <div className="lg:col-span-7 space-y-5">
          <AnalysisPanel
            record={record}
            onSave={() => {}} // Disabled for shared page view
            isSaving={false}
            onCopy={handleCopyLevels}
            onExportCSV={handleExportCSV}
            isSaved={true} // Marked as saved since it is already on the DB
          />

          <LevelChart record={record} />
        </div>
      </div>
    </div>
  );
};

export default ShareClient;
