import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { fmt } from '@/utils/format';

interface IndexSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  score: number;
  classification: string;
  entry: number;
  stopLoss: number;
  target: number;
  signalDate: string;
  signalTime: string;
}

interface IndexSignalRowProps {
  signal: IndexSignal;
}

export function IndexSignalRow({ signal }: IndexSignalRowProps) {
  const isLong = signal.direction === 'LONG';
  
  return (
    <tr className="border-b border-border-primary/50 hover:bg-bg-tertiary/20 group font-mono text-[10px]">
      <td className="p-2 align-middle">
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-text-primary text-[11px] uppercase tracking-wide cursor-pointer hover:text-accent-blue transition-colors">
            {signal.symbol}
          </span>
          <span className="text-[9px] text-text-tertiary flex items-center gap-1">
            {signal.signalTime}
          </span>
        </div>
      </td>
      <td className="p-2 align-middle">
        <Badge variant={isLong ? 'green' : 'red'} className="text-[9px] px-1.5 py-0">
          {isLong ? <TrendingUp size={10} className="mr-1" /> : <TrendingDown size={10} className="mr-1" />}
          {signal.direction}
        </Badge>
      </td>
      <td className="p-2 align-middle font-bold text-text-primary">
        {signal.score}
      </td>
      <td className="p-2 align-middle">
        <span className={`text-[9px] font-bold ${signal.classification.includes('STRONG') ? 'text-accent-purple' : 'text-accent-blue'}`}>
          {signal.classification.replace('INDEX_', '')}
        </span>
      </td>
      <td className="p-2 align-middle font-bold text-accent-amber">
        {fmt(signal.entry)}
      </td>
      <td className="p-2 align-middle text-accent-red font-semibold">
        {fmt(signal.stopLoss)}
      </td>
      <td className="p-2 align-middle text-accent-green font-semibold">
        {fmt(signal.target)}
      </td>
    </tr>
  );
}
