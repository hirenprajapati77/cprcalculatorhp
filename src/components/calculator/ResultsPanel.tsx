'use client';

import React from 'react';
import { CPRResult } from '@/types/cpr.types';
import { Card } from '@/components/ui/Card';
import { CPRBand } from './CPRBand';
import { LevelGrid } from './LevelGrid';
import { Target, Compass } from 'lucide-react';

interface ResultsPanelProps {
  result: CPRResult | null;
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({ result }) => {
  return (
    <Card title="cpr levels" icon={<Target size={14} className="text-accent-blue" />}>
      {!result ? (
        <div className="flex flex-col items-center justify-center py-12 text-center font-mono">
          <Compass size={32} className="text-text-tertiary/40 animate-pulse mb-3" />
          <p className="text-xs text-text-tertiary">
            Enter High, Low, and Close values and click Calculate.
          </p>
        </div>
      ) : (
        <div className="space-y-4 animate-fade-in">
          {/* Main bands */}
          <CPRBand pivot={result.pivot} tc={result.tc} bc={result.bc} />
          
          <div className="h-[0.5px] bg-border-primary" />
          
          {/* Grid levels */}
          <LevelGrid
            r1={result.r1}
            r2={result.r2}
            r3={result.r3}
            r4={result.r4}
            s1={result.s1}
            s2={result.s2}
            s3={result.s3}
            s4={result.s4}
          />
        </div>
      )}
    </Card>
  );
};

export default ResultsPanel;
