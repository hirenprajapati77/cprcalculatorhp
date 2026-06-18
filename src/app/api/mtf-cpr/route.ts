import { NextRequest, NextResponse } from 'next/server';
import { MtfCprService } from '@/services/mtf-cpr.service';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  try {
    const levels = await MtfCprService.getLevels(symbol);
    return NextResponse.json(levels);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
