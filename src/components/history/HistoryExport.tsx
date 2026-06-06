'use client';

import React from 'react';
import { CalculationRecord } from '@/types/cpr.types';
import { Button } from '@/components/ui/Button';
import { FileSpreadsheet, Trash2, ShieldAlert } from 'lucide-react';

interface HistoryExportProps {
  calculations: CalculationRecord[];
  onClearAll: () => void;
  filteredCount: number;
}

export const HistoryExport: React.FC<HistoryExportProps> = ({
  calculations,
  onClearAll,
  filteredCount,
}) => {
  const [showConfirm, setShowConfirm] = React.useState(false);

  const handleExportAll = () => {
    if (calculations.length === 0) return;

    // Create consolidated CSV header and rows
    const header = [
      'Saved Time',
      'High',
      'Low',
      'Close',
      'Pivot (P)',
      'TC',
      'BC',
      'R1',
      'R2',
      'R3',
      'R4',
      'S1',
      'S2',
      'S3',
      'S4',
      'Width %',
      'Classification',
      'Trend Bias',
    ];

    const rows = calculations.map((c) => [
      c.createdAt.toISOString(),
      c.high,
      c.low,
      c.close,
      c.pivot.toFixed(2),
      c.tc.toFixed(2),
      c.bc.toFixed(2),
      c.r1.toFixed(2),
      c.r2.toFixed(2),
      c.r3.toFixed(2),
      c.r4.toFixed(2),
      c.s1.toFixed(2),
      c.s2.toFixed(2),
      c.s3.toFixed(2),
      c.s4.toFixed(2),
      `${c.width.toFixed(3)}%`,
      c.classification,
      c.trend,
    ]);

    const csvContent = [
      header.join(','),
      ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `cpr_history_export_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-bg-primary border border-border-primary rounded-lg p-4 font-mono text-xs">
      <div className="text-text-secondary">
        Showing <span className="text-text-primary font-semibold">{filteredCount}</span> of{' '}
        <span className="text-text-primary font-semibold">{calculations.length}</span> saved sessions
      </div>

      <div className="flex gap-2 w-full sm:w-auto">
        <Button
          onClick={handleExportAll}
          disabled={calculations.length === 0}
          size="sm"
          className="flex-1 sm:flex-none"
        >
          <FileSpreadsheet size={13} />
          Export All (CSV)
        </Button>

        {showConfirm ? (
          <div className="flex gap-1 items-center w-full sm:w-auto">
            <Button
              onClick={() => {
                onClearAll();
                setShowConfirm(false);
              }}
              variant="danger"
              size="sm"
              className="flex-1 sm:flex-none animate-pulse"
            >
              <ShieldAlert size={13} />
              Confirm Clear
            </Button>
            <Button
              onClick={() => setShowConfirm(false)}
              size="sm"
              className="px-2"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={calculations.length === 0}
            variant="danger"
            size="sm"
            className="flex-1 sm:flex-none"
          >
            <Trash2 size={13} />
            Clear All
          </Button>
        )}
      </div>
    </div>
  );
};

export default HistoryExport;
