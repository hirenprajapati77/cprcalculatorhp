import { NextResponse } from 'next/server';
import { AnalyticsService } from '@/services/analytics.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await AnalyticsService.getSignalAnalytics();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch signal analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signal analytics' },
      { status: 500 }
    );
  }
}
