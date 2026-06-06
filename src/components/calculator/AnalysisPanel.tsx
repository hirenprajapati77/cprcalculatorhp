'use client';

import React from 'react';
import { CalculationRecord } from '@/types/cpr.types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatPct } from '@/utils/format';
import { Activity, Copy, FileSpreadsheet, Save } from 'lucide-react';

interface AnalysisPanelProps {
  record: Omit<CalculationRecord, 'id' | 'createdAt'> | null;
  onSave: () => void;
  isSaving: boolean;
  onCopy: () => void;
  onExportCSV: () => void;
  isSaved?: boolean;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  record,
  onSave,
  isSaving,
  onCopy,
  onExportCSV,
  isSaved = false,
}) => {
  if (!record) {
    return (
      <Card title="analysis" icon={<Activity size={14} className="text-accent-blue" />}>
        <div className="flex flex-col items-center justify-center py-16 text-center font-mono">
          <Activity size={32} className="text-text-tertiary/40 mb-3" />
          <p className="text-xs text-text-tertiary">
            Calculate CPR to see technical analysis and actions.
          </p>
        </div>
      </Card>
    );
  }

  // Calculate percentage fill relative to a maximum reference width of 1.5%
  const widthFillPct = Math.min((record.width / 1.5) * 100, 100);

  const getClassificationVariant = (cls: string) => {
    if (cls === 'NARROW') return 'green';
    if (cls === 'WIDE') return 'red';
    return 'amber';
  };

  const getTrendVariant = (trend: string) => {
    if (trend === 'Trending') return 'green';
    if (trend === 'Ranging') return 'red';
    return 'amber';
  };

  const insights = {
    NARROW:
      '⚡ NARROW CPR indicates a high probability of a strong breakout or trending day. Price is likely to move decisively away from the CPR band. Breakout trading strategies and trend-following setups are highly preferred. Avoid counter-trend trades unless critical levels are swept.',
    NORMAL:
      '⚖ NORMAL CPR suggests a balanced session. The market can exhibit both short-term trending extensions and mean-reversion pullbacks. Reversals from key support/resistance levels are common. Wait for clear candlestick confirmations near CPR boundaries before entering.',
    WIDE:
      '🔄 WIDE CPR signals a range-bound or sideways market. Price is highly likely to oscillate within or around the CPR band. Rejection setups at extreme levels (e.g. S1/R1 or S2/R2) are preferred. Avoid aggressive breakout trades, as they are prone to failure.',
  };

  return (
    <Card title="analysis" icon={<Activity size={14} className="text-accent-blue" />}>
      <div className="space-y-4 font-mono animate-fade-in">
        {/* Metric Cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-bg-secondary p-2.5 rounded border border-border-primary text-center">
            <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
              Width
            </div>
            <div className="text-sm font-semibold text-text-primary">
              {formatPct(record.width)}
            </div>
          </div>
          
          <div className="bg-bg-secondary p-2.5 rounded border border-border-primary text-center">
            <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
              Type
            </div>
            <div className="mt-0.5">
              <Badge variant={getClassificationVariant(record.classification)}>
                {record.classification}
              </Badge>
            </div>
          </div>
          
          <div className="bg-bg-secondary p-2.5 rounded border border-border-primary text-center">
            <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
              Bias
            </div>
            <div className="mt-0.5">
              <Badge variant={getTrendVariant(record.trend)}>
                {record.trend}
              </Badge>
            </div>
          </div>
        </div>

        {/* Width Progress Bar */}
        <div>
          <div className="flex justify-between items-center text-[10px] text-text-secondary mb-1.5">
            <span>CPR Width Relative Scale</span>
            <span className="font-semibold">{formatPct(record.width)}</span>
          </div>
          <div className="w-full bg-bg-secondary h-2.5 rounded border border-border-primary overflow-hidden p-[2px]">
            <div
              className={`h-full rounded-sm transition-all duration-500 ${
                record.classification === 'NARROW'
                  ? 'bg-accent-green'
                  : record.classification === 'WIDE'
                  ? 'bg-accent-red'
                  : 'bg-accent-amber'
              }`}
              style={{ width: `${widthFillPct}%` }}
            />
          </div>
        </div>

        <div className="h-[0.5px] bg-border-primary" />

        {/* Trading Insight */}
        <div>
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-semibold">
            Market Context & Bias
          </span>
          <p className="text-xs text-text-secondary leading-relaxed mt-1 bg-bg-secondary/40 p-2.5 rounded border border-border-primary/50">
            {insights[record.classification]}
          </p>
        </div>

        <div className="h-[0.5px] bg-border-primary" />

        {/* Export & Copy buttons */}
        <div className="flex flex-wrap gap-2 pt-1.5">
          <Button onClick={onCopy} className="flex-1 min-w-[110px]" size="sm">
            <Copy size={13} />
            Copy levels
          </Button>
          
          <Button onClick={onExportCSV} className="flex-1 min-w-[110px]" size="sm">
            <FileSpreadsheet size={13} />
            Export CSV
          </Button>

          <Button
            onClick={onSave}
            variant={isSaved ? 'ghost' : 'primary'}
            disabled={isSaving || isSaved}
            className="flex-grow min-w-[110px] md:flex-none"
            size="sm"
          >
            <Save size={13} />
            {isSaved ? 'Saved to DB' : isSaving ? 'Saving...' : 'Save Session'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default AnalysisPanel;
