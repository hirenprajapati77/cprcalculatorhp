'use client';

import React from 'react';
import { CalculationRecord } from '@/types/cpr.types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { fmt, formatPct, formatDate } from '@/utils/format';
import { Trash2, ArrowUpRight, Calendar } from 'lucide-react';

interface HistoryTableProps {
  calculations: CalculationRecord[];
  onLoadEntry: (record: CalculationRecord) => void;
  onDeleteEntry: (id: string) => void;
  isDeletingId: string | null;
}

export const HistoryTable: React.FC<HistoryTableProps> = ({
  calculations,
  onLoadEntry,
  onDeleteEntry,
  isDeletingId,
}) => {
  if (calculations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center font-mono border border-dashed border-border-secondary rounded-lg">
        <Calendar size={32} className="text-text-tertiary/40 mb-3" />
        <p className="text-xs text-text-tertiary">No calculations found in history.</p>
      </div>
    );
  }

  const getClassificationVariant = (cls: string) => {
    if (cls === 'NARROW') return 'green';
    if (cls === 'WIDE') return 'red';
    return 'amber';
  };

  return (
    <div className="w-full overflow-x-auto border border-border-primary rounded-lg font-mono">
      <table className="w-full text-left border-collapse min-w-[650px]">
        <thead>
          <tr className="bg-bg-secondary border-b border-border-primary text-[10px] text-text-tertiary uppercase tracking-wider">
            <th className="px-4 py-3 font-semibold">Saved Time</th>
            <th className="px-4 py-3 font-semibold">Inputs (H / L / C)</th>
            <th className="px-4 py-3 font-semibold">Pivot (P)</th>
            <th className="px-4 py-3 font-semibold">TC / BC</th>
            <th className="px-4 py-3 font-semibold">Width (%)</th>
            <th className="px-4 py-3 font-semibold">Type</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-primary text-xs">
          {calculations.map((c) => (
            <tr
              key={c.id}
              className="hover:bg-bg-secondary/40 transition-colors group"
            >
              <td className="px-4 py-3.5 text-text-secondary whitespace-nowrap">
                {formatDate(c.createdAt)}
              </td>
              <td className="px-4 py-3.5 text-text-primary whitespace-nowrap font-medium">
                {fmt(c.high)} <span className="text-text-tertiary">/</span> {fmt(c.low)}{' '}
                <span className="text-text-tertiary">/</span> {fmt(c.close)}
              </td>
              <td className="px-4 py-3.5 text-accent-blue font-semibold whitespace-nowrap">
                {fmt(c.pivot)}
              </td>
              <td className="px-4 py-3.5 text-text-primary whitespace-nowrap">
                {fmt(c.tc)} <span className="text-text-tertiary">/</span> {fmt(c.bc)}
              </td>
              <td className="px-4 py-3.5 text-text-secondary whitespace-nowrap">
                {formatPct(c.width)}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                <Badge variant={getClassificationVariant(c.classification)}>
                  {c.classification}
                </Badge>
              </td>
              <td className="px-4 py-3.5 text-right whitespace-nowrap">
                <div className="flex justify-end gap-1.5">
                  <Button
                    onClick={() => onLoadEntry(c)}
                    variant="ghost"
                    size="sm"
                    className="p-1 h-7 w-7 text-text-secondary hover:text-accent-blue hover:bg-bg-tertiary border border-transparent hover:border-border-secondary"
                    title="Load calculation"
                  >
                    <ArrowUpRight size={14} />
                  </Button>
                  <Button
                    onClick={() => onDeleteEntry(c.id)}
                    disabled={isDeletingId === c.id}
                    variant="ghost"
                    size="sm"
                    className="p-1 h-7 w-7 text-text-secondary hover:text-accent-red hover:bg-accent-red/10 border border-transparent hover:border-accent-red/25"
                    title="Delete record"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default HistoryTable;
