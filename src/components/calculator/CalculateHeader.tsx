'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import {
  Share2,
  Copy,
  FileSpreadsheet,
  RotateCcw,
  ExternalLink,
  Layers,
  Clock,
  Sparkles,
  Check,
} from 'lucide-react';
import { CalculationRecord } from '@/types/cpr.types';
import { getISTTime } from '@/lib/market-hours';

interface CalculateHeaderProps {
  record: CalculationRecord | null;
  activeSymbol: string | null;
  onReset: () => void;
  onCopyReport: () => void;
  onExportCSV: () => void;
  onShareURL: () => void;
  onOpenStockDrawer?: ((symbol: string) => void) | undefined;
  isCopied?: boolean | undefined;
}

export const CalculateHeader: React.FC<CalculateHeaderProps> = ({
  record,
  activeSymbol,
  onReset,
  onCopyReport,
  onExportCSV,
  onShareURL,
  onOpenStockDrawer,
  isCopied = false,
}) => {
  const ist = getISTTime();
  const currentDate = ist.dateString;
  const currentTime = `${String(ist.hour).padStart(2, '0')}:${String(ist.minute).padStart(2, '0')}`;

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 md:p-5 font-mono relative overflow-hidden select-none">
      {/* Background watermark */}
      <div className="absolute top-0 right-0 h-full w-1/3 opacity-[0.03] pointer-events-none select-none">
        <Layers className="h-full w-full stroke-[0.5]" />
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Title and Metadata */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-accent-blue font-bold uppercase tracking-widest flex items-center gap-1.5 bg-accent-blue/10 border border-accent-blue/20 px-2 py-0.5 rounded">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-blue animate-pulse" />
              Quant CPR Workstation
            </span>

            {activeSymbol && (
              <span className="text-[10px] text-text-primary font-bold uppercase tracking-wider bg-bg-tertiary border border-border-secondary px-2 py-0.5 rounded flex items-center gap-1">
                <Sparkles size={11} className="text-accent-amber" />
                {activeSymbol}
              </span>
            )}

            <span className="text-[10px] text-text-tertiary flex items-center gap-1">
              <Clock size={11} />
              {currentDate} &bull; {currentTime} IST
            </span>
          </div>

          <h1 className="text-lg md:text-2xl font-bold tracking-tight text-text-primary uppercase flex items-center gap-2">
            Multi-Timeframe CPR Calculator
          </h1>

          <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
            Compute institutional Pivot, TC &amp; BC bands across Daily, Weekly, and Monthly timeframes. Detect volatility compression and key confluence zones.
          </p>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto pt-2 lg:pt-0">
          {activeSymbol && onOpenStockDrawer && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenStockDrawer(activeSymbol)}
              className="text-xs flex items-center gap-1.5 border-accent-blue/30 text-accent-blue hover:bg-accent-blue/10"
              title="Open full analytics drawer for this stock"
            >
              <ExternalLink size={13} />
              Stock Drawer
            </Button>
          )}

          {record && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onCopyReport}
                className="text-xs flex items-center gap-1.5"
                title="Copy comprehensive text report to clipboard"
              >
                {isCopied ? <Check size={13} className="text-accent-green" /> : <Copy size={13} />}
                {isCopied ? 'Copied' : 'Copy Report'}
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onExportCSV}
                className="text-xs flex items-center gap-1.5"
                title="Download CSV level report"
              >
                <FileSpreadsheet size={13} />
                CSV
              </Button>

              {record.shareToken && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onShareURL}
                  className="text-xs flex items-center gap-1.5"
                  title="Copy read-only public share URL"
                >
                  <Share2 size={13} />
                  Share
                </Button>
              )}
            </>
          )}

          {record && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="text-xs flex items-center gap-1.5 text-text-tertiary hover:text-accent-red"
              title="Reset all inputs and levels"
            >
              <RotateCcw size={13} />
              Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalculateHeader;
