'use client';

import React from 'react';
import { CPRResult } from '@/types/cpr.types';
import { Card } from '@/components/ui/Card';
import { CPRBand } from './CPRBand';
import { LevelGrid } from './LevelGrid';
import { Target, Compass } from 'lucide-react';

interface ResultsPanelProps {
  result: CPRResult | null;
  mtfLevels?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({ result, mtfLevels }) => {
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

          {mtfLevels && (
            <div className="mt-6 pt-4 border-t border-border-primary">
              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-4 flex items-center gap-2">
                <Compass size={14} className="text-accent-blue" />
                MULTI-TIMEFRAME CPR LEVELS
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                <div className="border border-border-primary/50 bg-bg-primary/20 rounded p-2">
                  <div className="font-bold text-text-primary mb-2 border-b border-border-primary/50 pb-1">DAILY</div>
                  <div className="space-y-1">
                    <div>TC: {result.tc.toFixed(2)}</div>
                    <div className="text-accent-blue font-bold">PIV: {result.pivot.toFixed(2)}</div>
                    <div>BC: {result.bc.toFixed(2)}</div>
                    <div className="text-text-tertiary mt-2">W: {result.width?.toFixed(2) || '?'}% ({result.classification || '?'})</div>
                  </div>
                </div>
                
                <div className="border border-border-primary/50 bg-bg-primary/20 rounded p-2">
                  <div className="font-bold text-text-primary mb-2 border-b border-border-primary/50 pb-1">WEEKLY</div>
                  <div className="space-y-1">
                    <div>TC: {mtfLevels.weekly.tc.toFixed(2)}</div>
                    <div className="text-accent-blue font-bold">PIV: {mtfLevels.weekly.pivot.toFixed(2)}</div>
                    <div>BC: {mtfLevels.weekly.bc.toFixed(2)}</div>
                    <div className="text-text-tertiary mt-2">W: {mtfLevels.weekly.width.toFixed(2)}% ({mtfLevels.weekly.classification})</div>
                  </div>
                </div>

                <div className="border border-border-primary/50 bg-bg-primary/20 rounded p-2">
                  <div className="font-bold text-text-primary mb-2 border-b border-border-primary/50 pb-1">MONTHLY</div>
                  <div className="space-y-1">
                    <div>TC: {mtfLevels.monthly.tc.toFixed(2)}</div>
                    <div className="text-accent-blue font-bold">PIV: {mtfLevels.monthly.pivot.toFixed(2)}</div>
                    <div>BC: {mtfLevels.monthly.bc.toFixed(2)}</div>
                    <div className="text-text-tertiary mt-2">W: {mtfLevels.monthly.width.toFixed(2)}% ({mtfLevels.monthly.classification})</div>
                  </div>
                </div>
              </div>
              {mtfLevels.confluence?.strongSupport?.length > 0 && (
                <div className="mt-3 text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded p-2 flex items-center gap-2">
                  ⭐ Strong Support at ₹{mtfLevels.confluence.strongSupport.join(', ')} (D+W+M aligned)
                </div>
              )}
              {mtfLevels.confluence?.strongResistance?.length > 0 && (
                <div className="mt-2 text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded p-2 flex items-center gap-2">
                  ⭐ Strong Resistance at ₹{mtfLevels.confluence.strongResistance.join(', ')} (D+W+M aligned)
                </div>
              )}
            </div>
          )}

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
