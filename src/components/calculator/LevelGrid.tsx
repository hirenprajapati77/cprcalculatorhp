'use client';

import React from 'react';
import { useCountUp } from '@/hooks/useCountUp';
import { fmt } from '@/utils/format';

interface LevelGridProps {
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
}

export const LevelGrid: React.FC<LevelGridProps> = ({
  r1,
  r2,
  r3,
  r4,
  s1,
  s2,
  s3,
  s4,
}) => {
  const animatedR1 = useCountUp(r1);
  const animatedR2 = useCountUp(r2);
  const animatedR3 = useCountUp(r3);
  const animatedR4 = useCountUp(r4);
  
  const animatedS1 = useCountUp(s1);
  const animatedS2 = useCountUp(s2);
  const animatedS3 = useCountUp(s3);
  const animatedS4 = useCountUp(s4);

  return (
    <div className="space-y-3 font-mono">
      {/* Resistance Levels */}
      <div>
        <div className="text-[10px] text-accent-red font-semibold uppercase tracking-wider mb-1">
          Resistance Levels
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex justify-between items-center px-2.5 py-2 rounded bg-accent-red/5 border border-accent-red/10">
            <span className="text-[10px] text-accent-red/80 font-bold">R4</span>
            <span className="text-xs font-semibold text-accent-red">{fmt(animatedR4)}</span>
          </div>
          <div className="flex justify-between items-center px-2.5 py-2 rounded bg-accent-red/5 border border-accent-red/10">
            <span className="text-[10px] text-accent-red/80 font-bold">R3</span>
            <span className="text-xs font-semibold text-accent-red">{fmt(animatedR3)}</span>
          </div>
          <div className="flex justify-between items-center px-2.5 py-2 rounded bg-accent-red/5 border border-accent-red/10">
            <span className="text-[10px] text-accent-red/80 font-bold">R2</span>
            <span className="text-xs font-semibold text-accent-red">{fmt(animatedR2)}</span>
          </div>
          <div className="flex justify-between items-center px-2.5 py-2 rounded bg-accent-red/5 border border-accent-red/10">
            <span className="text-[10px] text-accent-red/80 font-bold">R1</span>
            <span className="text-xs font-semibold text-accent-red">{fmt(animatedR1)}</span>
          </div>
        </div>
      </div>

      {/* Support Levels */}
      <div>
        <div className="text-[10px] text-accent-blue font-semibold uppercase tracking-wider mb-1">
          Support Levels
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex justify-between items-center px-2.5 py-2 rounded bg-accent-blue/5 border border-accent-blue/10">
            <span className="text-[10px] text-accent-blue/80 font-bold">S1</span>
            <span className="text-xs font-semibold text-accent-blue">{fmt(animatedS1)}</span>
          </div>
          <div className="flex justify-between items-center px-2.5 py-2 rounded bg-accent-blue/5 border border-accent-blue/10">
            <span className="text-[10px] text-accent-blue/80 font-bold">S2</span>
            <span className="text-xs font-semibold text-accent-blue">{fmt(animatedS2)}</span>
          </div>
          <div className="flex justify-between items-center px-2.5 py-2 rounded bg-accent-blue/5 border border-accent-blue/10">
            <span className="text-[10px] text-accent-blue/80 font-bold">S3</span>
            <span className="text-xs font-semibold text-accent-blue">{fmt(animatedS3)}</span>
          </div>
          <div className="flex justify-between items-center px-2.5 py-2 rounded bg-accent-blue/5 border border-accent-blue/10">
            <span className="text-[10px] text-accent-blue/80 font-bold">S4</span>
            <span className="text-xs font-semibold text-accent-blue">{fmt(animatedS4)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LevelGrid;
