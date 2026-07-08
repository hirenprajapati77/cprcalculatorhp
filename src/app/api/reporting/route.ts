import { NextResponse } from 'next/server';
import { JournalReportService } from '@/services/reporting/journal-report.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [buckets, regimes, execution, risks, variance] = await Promise.all([
      JournalReportService.getQualityBucketStats(),
      JournalReportService.getRegimeStats(),
      JournalReportService.getExecutionOutcomeStats(),
      JournalReportService.getEventRiskStats(),
      JournalReportService.getExecutionVarianceReport()
    ]);

    return NextResponse.json({
      success: true,
      data: {
        qualityBuckets: buckets,
        regimes,
        executionOutcomes: execution,
        eventRisks: risks,
        variance,
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
