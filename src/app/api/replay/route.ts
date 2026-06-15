import { NextRequest, NextResponse } from 'next/server';
import { ReplayService } from '@/services/backtest/replay.service';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tradeId = searchParams.get('tradeId');

  if (!tradeId) {
    return NextResponse.json({ error: 'tradeId is required' }, { status: 400 });
  }

  try {
    const payload = await ReplayService.getReplayPayload(tradeId);
    return NextResponse.json(payload);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
