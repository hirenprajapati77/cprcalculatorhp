import React from 'react';
import { Card } from '@/components/ui/Card';
import { HelpCircle, Sparkles } from 'lucide-react';

export default function FAQPage() {
  const faqs = [
    {
      q: 'Which financial assets can I analyze with CPR?',
      a: 'CPR is completely mathematical and relies only on High, Low, and Close prices. It can be applied to any asset class—including Stock Indices (e.g. Nifty, BankNifty, S&P 500), Individual Stocks, Cryptocurrencies, Forex, and Commodities.',
    },
    {
      q: 'What timeframe is recommended for plotting CPR levels?',
      a: 'The CPR is calculated using Daily parameters and plotted on intraday charts (typically 5-minute, 15-minute, or 1-hour intervals) to identify entry and exit levels for day trading. Weekly and Monthly CPRs can also be calculated for swing traders.',
    },
    {
      q: 'How do S1-S4 and R1-R4 levels differ in function?',
      a: 'R1 and S1 are primary support/resistance levels. Breaks of R1/S1 often trigger breakouts toward R2/S2. R3/S3 and R4/S4 represent extreme extensions, typically reached only during highly volatile, one-sided trend days.',
    },
    {
      q: 'How does CPR compare to standard Daily Pivot Points?',
      a: 'Standard Pivot Points use a single pivot line (P). CPR adds a top (TC) and bottom (BC) central boundary. This central band provides a volumetric range rather than a single point, allowing traders to gauge the strength of support or resistance zones.',
    },
    {
      q: 'How does CPR width predict trending vs. range days?',
      a: 'A narrow range (TC and BC very close) signifies low volatility in the previous session, representing a coiled spring ready to release energy (breakout). A wide range indicates high prior volatility, suggesting mean-reversion as price oscillates between extremes.',
    },
    {
      q: 'Is it possible to calculate weekly or monthly CPR levels?',
      a: 'Yes. To calculate Weekly CPR, use the High, Low, and Close of the previous full week. For Monthly CPR, use the parameters of the previous calendar month. These are useful for swing and position trading.',
    },
  ];

  return (
    <div className="space-y-5 max-w-4xl mx-auto font-mono text-xs">
      {/* Header */}
      <div className="bg-bg-secondary border border-border-primary rounded-lg p-5 select-none">
        <span className="text-[10px] text-accent-blue font-bold uppercase tracking-widest flex items-center gap-1.5">
          <HelpCircle size={13} />
          Knowledge Hub
        </span>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary uppercase mt-1">
          Frequently Asked Questions
        </h1>
        <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
          Quick answers to technical questions about Central Pivot Range trading and applications.
        </p>
      </div>

      {/* Grid of FAQ cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {faqs.map((faq, index) => (
          <Card
            key={index}
            title={faq.q}
            icon={<Sparkles size={12} className="text-accent-amber" />}
            className="flex flex-col h-full"
          >
            <p className="text-text-secondary leading-relaxed text-xs">
              {faq.a}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
