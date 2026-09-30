'use client';

import React, { useState } from 'react';
import { fmt, formatPct } from '@/utils/format';
import { Copy, Check, Target } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export interface CPRLevelGridProps {
  levels: {
    r4: number;
    r3: number;
    r2: number;
    r1: number;
    tc: number;
    pivot: number;
    bc: number;
    s1: number;
    s2: number;
    s3: number;
    s4: number;
  };
  referencePrice?: number | undefined; // Close price or LTP
  symbol?: string | undefined;
}

export const CPRLevelGrid: React.FC<CPRLevelGridProps> = ({
  levels,
  referencePrice,
  symbol,
}) => {
  const { showToast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopyLevel = (label: string, price: number) => {
    const text = `${symbol ? `${symbol} ` : ''}${label}: ${fmt(price)}`;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopiedKey(label);
        showToast(`Copied ${label} (${fmt(price)})`, 'success');
        setTimeout(() => setCopiedKey(null), 1500);
      },
      () => showToast('Failed to copy level', 'error')
    );
  };

  const getDistance = (price: number) => {
    if (referencePrice === undefined || referencePrice === 0) return null;
    const diff = price - referencePrice;
    const diffPct = (diff / referencePrice) * 100;
    return {
      pts: diff,
      pct: diffPct,
      isAbove: diff > 0,
    };
  };

  const rows = [
    { key: 'R4', price: levels.r4, role: 'Extreme Resistance / Target', type: 'resistance', tier: 4 },
    { key: 'R3', price: levels.r3, role: 'Trend Extension Target', type: 'resistance', tier: 3 },
    { key: 'R2', price: levels.r2, role: 'Secondary Resistance', type: 'resistance', tier: 2 },
    { key: 'R1', price: levels.r1, role: 'Primary Resistance Threshold', type: 'resistance', tier: 1 },
    { key: 'TC', price: levels.tc, role: 'Top Central Pivot Range', type: 'cpr', tier: 0 },
    { key: 'P', price: levels.pivot, role: 'Central Pivot Point (Anchor)', type: 'pivot', tier: 0 },
    { key: 'BC', price: levels.bc, role: 'Bottom Central Pivot Range', type: 'cpr', tier: 0 },
    { key: 'S1', price: levels.s1, role: 'Primary Support Threshold', type: 'support', tier: 1 },
    { key: 'S2', price: levels.s2, role: 'Secondary Support', type: 'support', tier: 2 },
    { key: 'S3', price: levels.s3, role: 'Trend Extension Support', type: 'support', tier: 3 },
    { key: 'S4', price: levels.s4, role: 'Extreme Support / Capitulation', type: 'support', tier: 4 },
  ];

  return (
    <div className="bg-bg-secondary border border-border-primary rounded-lg p-4 font-mono select-none">
      <div className="flex items-center justify-between pb-3 border-b border-border-primary/60 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-bg-tertiary border border-border-secondary">
            <Target size={14} className="text-accent-blue" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
              Institutional Level Matrix
            </h3>
            <p className="text-[10px] text-text-tertiary">
              Complete 11-level hierarchy &bull; {referencePrice ? `Distance relative to ₹${fmt(referencePrice)}` : 'Absolute price levels'}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border-primary/50 text-[10px] text-text-tertiary uppercase tracking-wider">
              <th className="py-2 px-2.5">Level</th>
              <th className="py-2 px-2.5">Price</th>
              <th className="py-2 px-2.5">Role / Zone</th>
              <th className="py-2 px-2.5 text-right">Distance</th>
              <th className="py-2 px-2.5 text-right w-10">Copy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-primary/30">
            {rows.map((row) => {
              const dist = getDistance(row.price);
              const isPivot = row.type === 'pivot';
              const isRes = row.type === 'resistance';
              const isSup = row.type === 'support';

              return (
                <tr
                  key={row.key}
                  className={`hover:bg-bg-tertiary/40 transition-colors ${
                    isPivot ? 'bg-accent-blue/5 font-semibold' : ''
                  }`}
                >
                  {/* Level Tag */}
                  <td className="py-2 px-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        isRes
                          ? 'bg-accent-red/10 text-accent-red border border-accent-red/20'
                          : isSup
                          ? 'bg-accent-blue/10 text-accent-blue border border-accent-blue/20'
                          : isPivot
                          ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40'
                          : 'bg-accent-green/10 text-accent-green border border-accent-green/20'
                      }`}
                    >
                      {row.key}
                    </span>
                  </td>

                  {/* Price */}
                  <td className="py-2 px-2.5 font-bold text-text-primary">
                    ₹{fmt(row.price)}
                  </td>

                  {/* Role */}
                  <td className="py-2 px-2.5 text-[11px] text-text-secondary truncate max-w-[180px]">
                    {row.role}
                  </td>

                  {/* Distance */}
                  <td className="py-2 px-2.5 text-right text-[11px]">
                    {dist ? (
                      <span
                        className={
                          dist.pts === 0
                            ? 'text-text-tertiary'
                            : dist.isAbove
                            ? 'text-accent-green font-medium'
                            : 'text-accent-red font-medium'
                        }
                      >
                        {dist.pts > 0 ? '+' : ''}
                        {fmt(dist.pts)} ({formatPct(dist.pct)})
                      </span>
                    ) : (
                      <span className="text-text-tertiary">-</span>
                    )}
                  </td>

                  {/* Copy action */}
                  <td className="py-2 px-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleCopyLevel(row.key, row.price)}
                      className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                      title={`Copy ${row.key} level`}
                    >
                      {copiedKey === row.key ? (
                        <Check size={12} className="text-accent-green" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CPRLevelGrid;
