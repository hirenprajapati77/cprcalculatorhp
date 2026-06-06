'use client';

import React, { useState } from 'react';
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
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LineChart as LineChartIcon, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { fmt } from '@/utils/format';

interface StockHistoryRecord {
  date: string;
  ltp: number;
  width: number;
  score: number;
}

interface StockCompareData {
  symbol: string;
  sector: string;
  history: StockHistoryRecord[];
}

interface MultiStockCompareChartProps {
  stocks: StockCompareData[];
}

const STOCK_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ef4444', // red
  '#06b6d4', // cyan
];

export const MultiStockCompareChart: React.FC<MultiStockCompareChartProps> = ({ stocks }) => {
  const [metric, setMetric] = useState<'ltp' | 'width' | 'score'>('ltp');

  if (stocks.length === 0) {
    return (
      <Card title="Comparative Trend Chart" icon={<LineChartIcon size={14} className="text-accent-blue" />}>
        <div className="flex flex-col items-center justify-center py-20 text-center font-mono">
          <LineChartIcon size={32} className="text-text-tertiary/40 mb-3" />
          <p className="text-xs text-text-tertiary">Select stocks above to visualize comparative trends.</p>
        </div>
      </Card>
    );
  }

  // 1. Gather all unique dates across all stock histories and sort them oldest -> newest
  const allDates = Array.from(
    new Set(stocks.flatMap((s) => s.history.map((h) => h.date)))
  ).sort();

  // 2. Build the chart data where each item is { date: 'YYYY-MM-DD', [symbol1]: val1, [symbol2]: val2, ... }
  const chartData = allDates.map((date) => {
    const row: Record<string, string | number> = { date };
    
    // Format date for X-Axis display e.g. "05 Jun"
    try {
      const dObj = new Date(date);
      row.name = dObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch {
      row.name = date;
    }

    stocks.forEach((stock) => {
      const histItem = stock.history.find((h) => h.date === date);
      if (histItem) {
        row[stock.symbol] = histItem[metric];
      }
    });

    return row;
  });

  // Calculate dynamic min/max bounds for the Y axis
  const values = chartData.flatMap((d) => 
    stocks.map((s) => d[s.symbol]).filter((v): v is number => typeof v === 'number')
  );
  
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const spread = maxVal - minVal;
  const yDomain = [
    metric === 'score' ? 0 : Math.max(0, minVal - spread * 0.1),
    metric === 'score' ? 100 : maxVal + spread * 0.1,
  ];

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-bg-tertiary border border-border-secondary p-3 rounded shadow-[0_4px_15px_rgba(0,0,0,0.5)] font-mono text-xs space-y-1">
          <div className="text-text-secondary border-b border-border-primary pb-1 mb-1.5 font-semibold">
            {label}
          </div>
          {payload.map((p) => (
            <div key={p.name} className="flex justify-between items-center gap-6">
              <span className="font-medium" style={{ color: p.color }}>
                {p.dataKey}:
              </span>
              <span className="text-text-primary font-semibold">
                {metric === 'ltp' ? '₹' : ''}
                {metric === 'width' ? p.value.toFixed(3) + '%' : fmt(p.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const metricTitle = {
    ltp: 'Price Overlay (₹)',
    width: 'CPR Width Trend (%)',
    score: 'Rank Score Trend (0-100)',
  };

  return (
    <Card 
      title={metricTitle[metric]} 
      icon={<LineChartIcon size={14} className="text-accent-blue" />}
      headerAction={
        <div className="flex items-center gap-1">
          <Button
            onClick={() => setMetric('ltp')}
            size="sm"
            variant={metric === 'ltp' ? 'primary' : 'ghost'}
            className="h-7 px-2.5 text-[10px]"
          >
            <DollarSign size={11} /> Price
          </Button>
          <Button
            onClick={() => setMetric('width')}
            size="sm"
            variant={metric === 'width' ? 'primary' : 'ghost'}
            className="h-7 px-2.5 text-[10px]"
          >
            <TrendingUp size={11} /> Width
          </Button>
          <Button
            onClick={() => setMetric('score')}
            size="sm"
            variant={metric === 'score' ? 'primary' : 'ghost'}
            className="h-7 px-2.5 text-[10px]"
          >
            <Activity size={11} /> Score
          </Button>
        </div>
      }
    >
      <div className="w-full h-[340px] font-mono select-none">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
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
              tickFormatter={(v) => 
                metric === 'width' 
                  ? v.toFixed(2) + '%' 
                  : v.toLocaleString('en-IN', { maximumFractionDigits: 0 })
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
            />
            {stocks.map((stock, index) => (
              <Line
                key={stock.symbol}
                type="monotone"
                dataKey={stock.symbol}
                stroke={STOCK_COLORS[index % STOCK_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
