import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { TradeJournalService } from '@/services/journal/trade-journal.service';

export const dynamic = 'force-dynamic';

// GET — fetch paginated journal entries with stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromDate   = searchParams.get('fromDate')   || undefined;
    const toDate     = searchParams.get('toDate')     || undefined;
    const signalType = searchParams.get('signalType') || 'ALL';
    const page       = parseInt(searchParams.get('page')  || '1');
    const limit      = parseInt(searchParams.get('limit') || '50');

    const result = await TradeJournalService.getEntries({
      ...(fromDate   ? { fromDate }   : {}),
      ...(toDate     ? { toDate }     : {}),
      ...(signalType ? { signalType } : {}),
      page,
      limit,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH — manual exit price update for a specific entry
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, exitCmp } = body as { id?: string; exitCmp?: number };

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'id is required and must be a string' },
        { status: 400 }
      );
    }
    if (!exitCmp || typeof exitCmp !== 'number' || exitCmp <= 0) {
      return NextResponse.json(
        { error: 'exitCmp is required and must be a positive number' },
        { status: 400 }
      );
    }

    // Verify entry exists before updating
    const entry = await prisma.tradeJournal.findUnique({ where: { id } });
    if (!entry) {
      return NextResponse.json(
        { error: `Journal entry not found: ${id}` },
        { status: 404 }
      );
    }

    // Do not overwrite a manual exit already set
    if (entry.exitCmp !== null) {
      return NextResponse.json(
        { error: 'Exit already recorded. Delete and re-enter to override.' },
        { status: 409 }
      );
    }

    const updated = await prisma.tradeJournal.update({
      where: { id },
      data: {
        exitCmp,
        exitTime: new Date(),
        pnl:    exitCmp - entry.entryCmp,
        pnlPct: ((exitCmp - entry.entryCmp) / entry.entryCmp) * 100,
      },
    });

    await TradeJournalService.classifyExecutionOutcome(id);

    return NextResponse.json({ success: true, entry: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
