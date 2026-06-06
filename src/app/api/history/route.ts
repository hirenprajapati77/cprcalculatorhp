import { NextResponse } from 'next/server';
import { HistoryService } from '@/services/history.service';

export async function GET() {
  try {
    const calculations = await HistoryService.getHistory(50);
    return NextResponse.json({ calculations }, { status: 200 });
  } catch (err) {
    console.error('Error fetching history:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching history' },
      { status: 500 }
    );
  }
}
