'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CPRInputSchema, CPRInputSchemaType } from '@/utils/validate';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Play, RotateCcw, Award } from 'lucide-react';

interface CalculatorFormProps {
  onCalculate: (data: CPRInputSchemaType) => void;
  onReset: () => void;
  isLoading: boolean;
}

export const CalculatorForm: React.FC<CalculatorFormProps> = ({
  onCalculate,
  onReset,
  isLoading,
}) => {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CPRInputSchemaType>({
    resolver: zodResolver(CPRInputSchema),
    defaultValues: {
      high: undefined,
      low: undefined,
      close: undefined,
    },
  });

  const onSubmit = (data: CPRInputSchemaType) => {
    onCalculate(data);
  };

  const handleLoadSample = () => {
    setValue('high', 25050, { shouldValidate: true });
    setValue('low', 24820, { shouldValidate: true });
    setValue('close', 24970, { shouldValidate: true });
  };

  const handleReset = () => {
    reset({
      high: undefined,
      low: undefined,
      close: undefined,
    });
    onReset();
  };

  return (
    <Card title="inputs" icon={<Award size={14} className="text-accent-blue" />}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 font-mono">
        <Input
          label="Previous High"
          placeholder="e.g. 25050"
          type="number"
          step="any"
          error={errors.high?.message}
          {...register('high', { valueAsNumber: true })}
        />

        <Input
          label="Previous Low"
          placeholder="e.g. 24820"
          type="number"
          step="any"
          error={errors.low?.message}
          {...register('low', { valueAsNumber: true })}
        />

        <Input
          label="Previous Close"
          placeholder="e.g. 24970"
          type="number"
          step="any"
          error={errors.close?.message}
          {...register('close', { valueAsNumber: true })}
        />

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button
            type="submit"
            variant="primary"
            className="col-span-2 w-full text-center"
            disabled={isLoading}
          >
            <Play size={14} />
            {isLoading ? 'Calculating...' : 'Calculate CPR'}
          </Button>

          <Button type="button" onClick={handleLoadSample} disabled={isLoading}>
            Load Sample
          </Button>

          <Button type="button" variant="secondary" onClick={handleReset} disabled={isLoading}>
            <RotateCcw size={13} />
            Reset
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default CalculatorForm;
