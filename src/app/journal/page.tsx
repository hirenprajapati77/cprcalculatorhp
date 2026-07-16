import { Metadata } from 'next';
import JournalClient from '@/components/journal/JournalClient';

export const metadata: Metadata = {
  title: 'Trade Journal — CPR Pro',
  description: 'Live option trade journal with snapshot tracking and P&L analysis for CPR, BTST, and STBT signals.',
};

import { JournalReportService } from '@/services/reporting/journal-report.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function JournalPage() {
  const emptyReportingData = {
    qualityBuckets: [],
    regimes: [],
    executionOutcomes: [],
    eventRisks: [],
    variance: { averageVariancePct: 0, sampleSize: 0 },
  };

  try {
    const [buckets, regimes, execution, risks, variance] = await Promise.all([
      JournalReportService.getQualityBucketStats(),
      JournalReportService.getRegimeStats(),
      JournalReportService.getExecutionOutcomeStats(),
      JournalReportService.getEventRiskStats(),
      JournalReportService.getExecutionVarianceReport()
    ]);

    return <JournalClient initialReportingData={{
      qualityBuckets: buckets,
      regimes,
      executionOutcomes: execution,
      eventRisks: risks,
      variance,
    }} />;
  } catch {
    // DB unavailable (e.g. local dev without a tunnel) — render UI with empty data
    return <JournalClient initialReportingData={emptyReportingData} />;
  }
}
