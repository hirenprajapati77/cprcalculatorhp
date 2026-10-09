'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CPRInputSchema, CPRInputSchemaType } from '@/utils/validate';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Play, RotateCcw, Sparkles, SlidersHorizontal, DownloadCloud } from 'lucide-react';

interface CalculationControlsProps {
  onCalculate: (data: CPRInputSchemaType) => void;
  onReset: () => void;
  onFetchSymbol?: ((symbol: string) => Promise<void>) | undefined;
  isLoading: boolean;
  isFetchingSymbol?: boolean | undefined;
  defaultValues?: Partial<CPRInputSchemaType> | undefined;
}

export const CalculationControls: React.FC<CalculationControlsProps> = ({
  onCalculate,
  onReset,
  onFetchSymbol,
  isLoading,
  isFetchingSymbol = false,
  defaultValues,
}) => {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CPRInputSchemaType>({
    resolver: zodResolver(CPRInputSchema),
    defaultValues: defaultValues || {},
  });

  const currentSymbol = watch('symbol');

  // Synchronize incoming defaultValues (from auto-fetch or presets) into form inputs
  React.useEffect(() => {
    if (defaultValues && Object.keys(defaultValues).length > 0) {
      if (defaultValues.symbol !== undefined) setValue('symbol', defaultValues.symbol, { shouldValidate: true });
      if (defaultValues.high !== undefined) setValue('high', defaultValues.high, { shouldValidate: true });
      if (defaultValues.low !== undefined) setValue('low', defaultValues.low, { shouldValidate: true });
      if (defaultValues.close !== undefined) setValue('close', defaultValues.close, { shouldValidate: true });
    }
  }, [defaultValues, setValue]);

  const onSubmit = (data: CPRInputSchemaType) => {
    onCalculate(data);
  };

  const handleQuickSymbolSelect = (sym: string) => {
    setValue('symbol', sym, { shouldValidate: true });
    if (onFetchSymbol) {
      onFetchSymbol(sym);
    }
  };

  const handleLoadSample = () => {
    const sample: CPRInputSchemaType = {
      symbol: 'NIFTY',
      high: 25150,
      low: 24920,
      close: 25080,
    };
    setValue('symbol', sample.symbol, { shouldValidate: true });
    setValue('high', sample.high, { shouldValidate: true });
    setValue('low', sample.low, { shouldValidate: true });
    setValue('close', sample.close, { shouldValidate: true });
    onCalculate(sample);
  };

  const handleFormReset = () => {
    reset({});
    onReset();
  };

  const quickSymbols = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'HDFCBANK', 'TCS', 'INFY'];

  return (
    <Card title="input controls" icon={<SlidersHorizontal size={14} className="text-accent-blue" />}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 font-mono select-none">
        {/* Quick Symbol Chips */}
        <div>
          <label className="text-[10px] text-text-tertiary uppercase tracking-wider block mb-1.5 font-semibold">
            Quick Universe Symbols
          </label>
          <div className="flex flex-wrap gap-1.5">
            {quickSymbols.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => handleQuickSymbolSelect(sym)}
                className={`text-[10px] px-2 py-1 rounded transition-colors ${
                  currentSymbol === sym
                    ? 'bg-accent-blue text-white font-bold'
                    : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary border border-border-primary'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Symbol with Auto-Fetch */}
        <div className="space-y-1">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Stock / Index Symbol (Optional for MTF)"
                placeholder="e.g. RELIANCE, NIFTY"
                type="text"
                {...register('symbol')}
                onChange={(e) => {
                  setValue('symbol', e.target.value.toUpperCase());
                }}
              />
            </div>
            {onFetchSymbol && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (currentSymbol) onFetchSymbol(currentSymbol);
                }}
                disabled={!currentSymbol || isFetchingSymbol || isLoading}
                className="text-xs h-9 mb-0.5 whitespace-nowrap"
                title="Fetch recent candle from market server"
              >
                <DownloadCloud size={13} className={isFetchingSymbol ? 'animate-bounce' : ''} />
                {isFetchingSymbol ? 'Fetching...' : 'Fetch'}
              </Button>
            )}
          </div>
        </div>

        {/* OHLC Input Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Previous High"
            placeholder="e.g. 25150"
            type="number"
            step="any"
            error={errors.high?.message || undefined}
            {...register('high', { valueAsNumber: true })}
          />

          <Input
            label="Previous Low"
            placeholder="e.g. 24920"
            type="number"
            step="any"
            error={errors.low?.message || undefined}
            {...register('low', { valueAsNumber: true })}
          />

          <Input
            label="Previous Close"
            placeholder="e.g. 25080"
            type="number"
            step="any"
            error={errors.close?.message || undefined}
            {...register('close', { valueAsNumber: true })}
          />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <Button
            type="submit"
            variant="primary"
            className="sm:col-span-1 w-full text-center"
            disabled={isLoading || isFetchingSymbol}
          >
            <Play size={13} />
            {isLoading ? 'Calculating...' : 'Calculate CPR'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={handleLoadSample}
            disabled={isLoading || isFetchingSymbol}
            className="w-full text-xs"
          >
            <Sparkles size={13} className="text-accent-amber" />
            Sample Data
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={handleFormReset}
            disabled={isLoading || isFetchingSymbol}
            className="w-full text-xs text-text-tertiary hover:text-accent-red"
          >
            <RotateCcw size={13} />
            Reset
          </Button>
        </div>

        <div className="text-[10px] text-text-tertiary text-center pt-1">
          Tip: Press <kbd className="px-1 py-0.5 rounded bg-bg-tertiary border border-border-secondary">Enter</kbd> to calculate levels instantly.
        </div>
      </form>
    </Card>
  );
};

export default CalculationControls;
