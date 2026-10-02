import React, { Suspense } from 'react';
import CalculatorClient from '@/components/calculator/CalculatorClient';

export default function CalculatePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center font-mono text-xs text-text-tertiary flex items-center justify-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent-blue animate-pulse" />
          Loading CPR Workstation...
        </div>
      }
    >
      <CalculatorClient />
    </Suspense>
  );
}
