'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { CPRResult } from '@/types/cpr.types';
import { Card } from '@/components/ui/Card';
import { BarChart3 } from 'lucide-react';
import { fmt } from '@/utils/format';

interface LevelChartProps {
  record: (CPRResult & { ltp?: number }) | null;
}

export const LevelChart: React.FC<LevelChartProps> = ({ record }) => {
  if (!record) {
    return (
      <Card title="level chart" icon={<BarChart3 size={14} />}>
        <div className="flex flex-col items-center justify-center py-20 text-center font-mono">
          <BarChart3 size={32} className="text-text-tertiary/40 mb-3" />
          <p className="text-xs text-text-tertiary">
            Calculate CPR to visualize level distributions.
          </p>
        </div>
      </Card>
    );
  }

  // Construct dataset in top-down price order: R4 down to S4
  const data = [
    { name: 'R4', value: record.r4, color: '#ef4444' }, // Crimson Red
    { name: 'R3', value: record.r3, color: '#f87171' }, 
    { name: 'R2', value: record.r2, color: '#fca5a5' }, 
    { name: 'R1', value: record.r1, color: '#fecaca' }, 
    { name: 'TC', value: record.tc, color: '#10b981' }, // Emerald Green
    { name: 'Pivot', value: record.pivot, color: '#3b82f6' }, // Blue
    { name: 'BC', value: record.bc, color: '#059669' }, // Dark Emerald
    { name: 'S1', value: record.s1, color: '#93c5fd' }, // Sky Blue
    { name: 'S2', value: record.s2, color: '#60a5fa' }, 
    { name: 'S3', value: record.s3, color: '#3b82f6' }, 
    { name: 'S4', value: record.s4, color: '#1d4ed8' }, // Dark Blue
  ];

  // Dynamic boundaries for X-axis domain to zoom in on price space
  const minVal = Math.min(...data.map(d => d.value));
  const maxVal = Math.max(...data.map(d => d.value));
  const padding = (maxVal - minVal) * 0.05; // 5% padding
  const xDomain = [Math.max(0, minVal - padding), maxVal + padding];

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number; color: string } }> }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-bg-tertiary border border-border-secondary p-2 rounded shadow-lg font-mono text-xs">
          <div className="font-semibold" style={{ color: item.color }}>
            {item.name}
          </div>
          <div className="text-text-primary mt-0.5">Price: {fmt(item.value)}</div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card title="level chart" icon={<BarChart3 size={14} className="text-accent-blue" />}>
      <div className="w-full h-[320px] font-mono select-none">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 10, left: -25, bottom: 5 }}
          >
            <XAxis
              type="number"
              domain={xDomain}
              tickFormatter={(v) => v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              stroke="#4b5563"
              tick={{ fill: '#9ca3af', fontSize: 10 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#4b5563"
              tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
            {record.ltp !== undefined && record.ltp !== null && (
              <ReferenceLine
                x={record.ltp}
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                label={{
                  value: `LTP: ₹${fmt(record.ltp)}`,
                  fill: '#f59e0b',
                  fontSize: 9,
                  position: 'top',
                  fontWeight: 'bold',
                }}
              />
            )}
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default LevelChart;
