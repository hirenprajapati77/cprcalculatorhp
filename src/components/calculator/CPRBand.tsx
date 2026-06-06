'use client';

import React from 'react';
import { useCountUp } from '@/hooks/useCountUp';
import { fmt } from '@/utils/format';

interface CPRBandProps {
  pivot: number;
  tc: number;
  bc: number;
}

export const CPRBand: React.FC<CPRBandProps> = ({ pivot, tc, bc }) => {
  const animatedPivot = useCountUp(pivot);
  const animatedTC = useCountUp(tc);
  const animatedBC = useCountUp(bc);

  return (
    <div className="font-mono">
      {/* Pivot Display */}
      <div className="text-center py-4 border-b border-border-primary mb-3">
        <span className="text-[10px] text-text-tertiary uppercase tracking-widest font-semibold">
          Pivot Point (P)
        </span>
        <div className="text-3xl font-semibold text-text-primary tracking-tight glow-blue mt-0.5">
          {fmt(animatedPivot)}
        </div>
      </div>

      {/* TC & BC Bands */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center px-3 py-2.5 rounded bg-accent-green/10 border border-accent-green/20">
          <span className="text-[11px] text-accent-green font-semibold uppercase tracking-wider">
            Top Central (TC)
          </span>
          <span className="text-sm font-semibold text-accent-green">
            {fmt(animatedTC)}
          </span>
        </div>
        
        <div className="flex justify-between items-center px-3 py-2.5 rounded bg-accent-green/5 border border-accent-green/10">
          <span className="text-[11px] text-accent-green/80 font-semibold uppercase tracking-wider">
            Bottom Central (BC)
          </span>
          <span className="text-sm font-semibold text-accent-green/90">
            {fmt(animatedBC)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CPRBand;
