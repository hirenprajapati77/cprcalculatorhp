import React from 'react';
import { Card } from '@/components/ui/Card';
import { Info, BarChart2, Compass, BookOpen } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="space-y-5 max-w-4xl mx-auto font-mono text-xs">
      {/* Title Header */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-5 select-none">
        <span className="text-[10px] text-accent-blue font-bold uppercase tracking-widest flex items-center gap-1.5">
          <Info size={13} />
          Documentation
        </span>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary uppercase mt-1">
          About Central Pivot Range
        </h1>
        <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
          Understanding the mathematics, structure, and trading applications of the CPR indicator.
        </p>
      </div>

      {/* Main Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card title="What is CPR?" icon={<BookOpen size={14} />}>
          <div className="space-y-3 text-text-secondary leading-relaxed">
            <p>
              The <strong className="text-text-primary">Central Pivot Range (CPR)</strong> is a highly powerful technical analysis indicator used by traders to identify key support and resistance levels, determine market bias, and predict potential breakouts.
            </p>
            <p>
              Unlike standard pivot points that only plot a single line, the CPR consists of three levels: the <strong className="text-text-primary">Pivot Point (P)</strong>, the <strong className="text-text-primary">Top Central Pivot (TC)</strong>, and the <strong className="text-text-primary">Bottom Central Pivot (BC)</strong>.
            </p>
            <p>
              Together, these three lines form a dynamic band that acts as a gravity center for price action. The relative width of this band provides clues about the expected market regime (trending vs. range-bound).
            </p>
          </div>
        </Card>

        <Card title="The Calculation Math" icon={<Compass size={14} />}>
          <div className="space-y-3 leading-relaxed text-text-secondary">
            <p className="border-b border-border-primary pb-2">
              All levels are calculated using the previous session&apos;s <strong className="text-text-primary">High (H)</strong>, <strong className="text-text-primary">Low (L)</strong>, and <strong className="text-text-primary">Close (C)</strong>:
            </p>
            <div className="space-y-2 bg-bg-secondary p-3 rounded border border-border-primary/50 text-[11px] text-text-primary">
              <div>
                <span className="text-text-tertiary">Pivot (P) =</span> (High + Low + Close) / 3
              </div>
              <div>
                <span className="text-text-tertiary">Bottom Central (BC) =</span> (High + Low) / 2
              </div>
              <div>
                <span className="text-text-tertiary">Top Central (TC) =</span> (Pivot - BC) + Pivot
              </div>
            </div>
            <p className="text-[10px]">
              Note: The Top Central and Bottom Central values are normalized. If the calculated TC is lower than BC, they are swapped so that TC is always the higher boundary.
            </p>
          </div>
        </Card>
      </div>

      {/* CPR Width Interpretation */}
      <Card title="Regime Classification & Trend Logic" icon={<BarChart2 size={14} />}>
        <div className="space-y-4 leading-relaxed text-text-secondary">
          <p>
            The percentage width of the CPR (calculated as <strong className="text-text-primary">(TC - BC) / Pivot * 100</strong>) defines the market classification:
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-bg-secondary p-3.5 rounded border border-border-primary border-l-4 border-l-accent-green">
              <span className="font-bold text-accent-green text-[10px] tracking-wider uppercase">Narrow CPR (&lt; 0.3%)</span>
              <p className="mt-1 text-[11px] leading-relaxed">
                Indicates tight consolidation in the previous session. Expect a <strong className="text-text-primary">Trending Day</strong> ahead. Price is highly likely to breakout and run directionally.
              </p>
            </div>
            
            <div className="bg-bg-secondary p-3.5 rounded border border-border-primary border-l-4 border-l-accent-amber">
              <span className="font-bold text-accent-amber text-[10px] tracking-wider uppercase">Normal CPR (&lt; 0.8%)</span>
              <p className="mt-1 text-[11px] leading-relaxed">
                Indicates balanced market forces. Expect a <strong className="text-text-primary">Balanced Session</strong>. Price may trade directionally or swing back and forth around the pivot.
              </p>
            </div>
            
            <div className="bg-bg-secondary p-3.5 rounded border border-border-primary border-l-4 border-l-accent-red">
              <span className="font-bold text-accent-red text-[10px] tracking-wider uppercase">Wide CPR (&gt;= 0.8%)</span>
              <p className="mt-1 text-[11px] leading-relaxed">
                Indicates large price swings in the previous session. Expect a <strong className="text-text-primary">Range-Bound Day</strong> ahead. Price is highly likely to reject extremes and revert.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
