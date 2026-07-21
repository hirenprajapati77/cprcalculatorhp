import React from 'react';
import { TrendingUp, TrendingDown, Zap, Clock, Info } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { fmt } from '@/utils/format';

interface IndexSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  score: number | null;
  confidence?: number | null;
  classification: string;
  signalType?: 'CALL_BUY' | 'PUT_BUY' | 'NO_TRADE';
  entry: number | null;
  stopLoss: number | null;
  target: number | null;
  riskReward?: string | null;
  signalDate: string;
  signalTime: string;
  scanType?: string;
  reasons?: string[];
  regime?: {
    trend: string;
    volatility: string;
    adjustment: number;
  } | null;
  optionSuggestion?: {
    symbol?: string;
    strike?: number;
    type?: 'CE' | 'PE';
    ltp?: number;
    momentumScore?: number;
    formattedName?: string;
    error?: string;
  } | null;
}

interface IndexSignalRowProps {
  signal: IndexSignal;
}

function signalTypeVariant(type?: string): 'green' | 'red' | 'gray' {
  if (type === 'CALL_BUY') return 'green';
  if (type === 'PUT_BUY') return 'red';
  return 'gray';
}

export function IndexSignalRow({ signal }: IndexSignalRowProps) {
  const isLong = signal.direction === 'LONG';
  const signalType = signal.signalType ?? (signal.classification === 'IGNORE' ? 'NO_TRADE' : isLong ? 'CALL_BUY' : 'PUT_BUY');
  const confidence = signal.confidence ?? signal.score;
  const reasonTitle = signal.reasons?.length ? signal.reasons.join('\n') : undefined;

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
        {signal.scanType ? (
          <Badge variant={signal.scanType === 'INTRA' ? 'blue' : 'purple'} className="text-[9px] px-1.5 py-0">
            {signal.scanType === 'INTRA' ? <Zap size={10} className="mr-1" /> : <Clock size={10} className="mr-1" />}
            {signal.scanType}
          </Badge>
        ) : (
          <span className="text-text-tertiary">—</span>
        )}
      </td>
      <td className="p-2 align-middle">
        <Badge variant={signalTypeVariant(signalType)} className="text-[9px] px-1.5 py-0">
          {signalType === 'CALL_BUY' ? <TrendingUp size={10} className="mr-1" /> :
           signalType === 'PUT_BUY' ? <TrendingDown size={10} className="mr-1" /> : null}
          {signalType.replace('_', ' ')}
        </Badge>
      </td>
      <td className="p-2 align-middle font-bold text-text-primary" title={`Base score: ${signal.score ?? '—'}`}>
        {confidence == null ? '—' : confidence}
      </td>
      <td className="p-2 align-middle">
        <div className="flex items-center gap-1">
          <span className={`text-[9px] font-bold ${signal.classification.includes('STRONG') ? 'text-accent-purple' : 'text-accent-blue'}`}>
            {signal.classification.replace('INDEX_', '')}
          </span>
          {reasonTitle && (
            <span title={reasonTitle} className="text-text-tertiary cursor-help">
              <Info size={10} />
            </span>
          )}
        </div>
      </td>
      <td className="p-2 align-middle text-[9px] text-text-secondary">
        {signal.riskReward ?? '—'}
      </td>
      <td className="p-2 align-middle font-bold text-accent-amber">
        {fmt(signal.entry as number)}
      </td>
      <td className="p-2 align-middle text-accent-red font-semibold">
        {fmt(signal.stopLoss as number)}
      </td>
      <td className="p-2 align-middle text-accent-green font-semibold">
        {fmt(signal.target as number)}
      </td>
      <td className="p-2 align-middle min-w-[140px]">
        {signal.optionSuggestion ? (
          signal.optionSuggestion.error ? (
            <div className="text-rose-400 text-[8.5px] font-semibold leading-tight flex items-center gap-1">
              <span>⚠️</span>
              <span className="truncate max-w-[120px]" title={signal.optionSuggestion.error}>
                {signal.optionSuggestion.error === 'TOKEN_EXPIRED' ? 'Fyers Disconnected' : 
                 signal.optionSuggestion.error === 'EMPTY_CHAIN' ? 'No Option Chain' :
                 `Err: ${signal.optionSuggestion.error}`}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-[9px]">
                <span className="font-bold text-accent-blue truncate max-w-[80px]" title={signal.optionSuggestion.formattedName}>
                  {signal.optionSuggestion.formattedName ? signal.optionSuggestion.formattedName.split(' ').slice(1).join(' ') : '—'}
                </span>
                <span className="font-extrabold text-text-primary">₹{fmt(signal.optionSuggestion.ltp || 0)}</span>
              </div>
              <div className={`text-[8px] font-bold leading-none ${
                (signal.optionSuggestion.momentumScore ?? 0) >= 70 ? 'text-accent-green' :
                (signal.optionSuggestion.momentumScore ?? 0) >= 40 ? 'text-accent-amber' : 'text-accent-red'
              }`}>
                Score: {signal.optionSuggestion.momentumScore ?? 0}/100
              </div>
            </div>
          )
        ) : (
          <span className="text-text-tertiary">—</span>
        )}
      </td>
    </tr>
  );
}
