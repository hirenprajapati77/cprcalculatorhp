'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CalculationRecord } from '@/types/cpr.types';
import { Card } from '@/components/ui/Card';
import { LineChart as LineChartIcon } from 'lucide-react';
import { fmt } from '@/utils/format';

interface SessionCompareChartProps {
  records: CalculationRecord[];
}

export const SessionCompareChart: React.FC<SessionCompareChartProps> = ({ records }) => {
  if (records.length < 2) {
    return (
      <Card title="session comparison" icon={<LineChartIcon size={14} className="text-accent-blue" />}>
        <div className="flex flex-col items-center justify-center py-24 text-center font-mono">
          <LineChartIcon size={32} className="text-text-tertiary/40 mb-3" />
          <p className="text-xs text-text-secondary font-semibold">Comparison Unavailable</p>
          <p className="text-[11px] text-text-tertiary mt-1 max-w-[250px]">
            Please save at least 2 sessions from the calculator to generate visual comparison charts.
          </p>
        </div>
      </Card>
    );
  }

  // Take the last 8 records and reverse them so they flow oldest -> newest (left -> right)
  const chartData = records
    .slice(0, 8)
    .reverse()
    .map((r, idx) => ({
      name: `Session ${idx + 1}`,
      Pivot: r.pivot,
      TC: r.tc,
      BC: r.bc,
      R1: r.r1,
      S1: r.s1,
      date: (() => {
        const ist = new Date(new Date(r.createdAt).getTime() + 330 * 60 * 1000);
        const day = String(ist.getUTCDate()).padStart(2, '0');
        const month = String(ist.getUTCMonth() + 1).padStart(2, '0');
        const hr = String(ist.getUTCHours()).padStart(2, '0');
        const min = String(ist.getUTCMinutes()).padStart(2, '0');
        return `${day}/${month} ${hr}:${min}`;
      })(),
    }));

  // Find min S1 and max R1 across the dataset to frame the graph properly
  const s1Values = chartData.map((d) => d.S1);
  const r1Values = chartData.map((d) => d.R1);
  const minVal = Math.min(...s1Values);
  const maxVal = Math.max(...r1Values);
  const spread = maxVal - minVal;
  const yDomain = [
    Math.max(0, minVal - spread * 0.15), // 15% padding below S1
    maxVal + spread * 0.15, // 15% padding above R1
  ];

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string; payload: { date: string } }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-bg-tertiary border border-border-secondary p-3 rounded shadow-[0_4px_15px_rgba(0,0,0,0.5)] font-mono text-xs space-y-1">
          <div className="text-text-secondary border-b border-border-primary pb-1 mb-1.5 font-semibold">
            {label} ({payload[0].payload.date})
          </div>
          {payload.map((p: { name: string; value: number; color: string }) => (
            <div key={p.name} className="flex justify-between items-center gap-6">
              <span className="font-medium" style={{ color: p.color }}>
                {p.name}:
              </span>
              <span className="text-text-primary font-semibold">{fmt(p.value)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card title="session comparison" icon={<LineChartIcon size={14} className="text-accent-blue" />}>
      <div className="w-full h-[320px] font-mono select-none">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.02)" strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              stroke="#4b5563"
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickLine={false}
            />
            <YAxis
              type="number"
              domain={yDomain}
              stroke="#4b5563"
              tick={{ fill: '#9ca3af', fontSize: 10 }}
              tickFormatter={(v) => v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
            />
            <Line
              type="monotone"
              dataKey="R1"
              stroke="#ef4444"
              strokeDasharray="3 3"
              strokeWidth={1.5}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="TC"
              stroke="#10b981"
              strokeDasharray="4 2"
              strokeWidth={1.5}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="Pivot"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="BC"
              stroke="#059669"
              strokeDasharray="4 2"
              strokeWidth={1.5}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="S1"
              stroke="#60a5fa"
              strokeDasharray="3 3"
              strokeWidth={1.5}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default SessionCompareChart;
