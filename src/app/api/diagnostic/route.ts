import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const journal = await prisma.tradeJournal.findMany({
      orderBy: { tradeDate: 'desc' },
      take: 10
    });
    
    const signal = await prisma.overnightSignal.findMany({
      orderBy: { signalDate: 'desc' },
      take: 10
    });

    return NextResponse.json({ success: true, journal, signal });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
