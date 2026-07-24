import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { computeOptionPnl } from '@/lib/pnl';
import { sanitizePagination } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

// GET — fetch paginated journal entries with stats
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromDate         = searchParams.get('fromDate')         || undefined;
    const toDate           = searchParams.get('toDate')           || undefined;
    const signalType       = searchParams.get('signalType')       || 'ALL';
    const qualityBucket    = searchParams.get('qualityBucket')    || 'ALL';
    const executionOutcome = searchParams.get('executionOutcome') || 'ALL';
    const { page, limit } = sanitizePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );

    const result = await TradeJournalService.getEntries({
      ...(fromDate   ? { fromDate }   : {}),
      ...(toDate     ? { toDate }     : {}),
      ...(signalType ? { signalType } : {}),
      ...(qualityBucket    ? { qualityBucket }    : {}),
      ...(executionOutcome ? { executionOutcome } : {}),
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

    // Do not overwrite an exit already set (manual or auto-close). The conditional
    // updateMany below is the authoritative guard against a race with the 9:45 AM
    // auto-close cron; this early check just returns a friendlier 409.
    if (entry.exitCmp !== null) {
      return NextResponse.json(
        { error: 'Exit already recorded. Delete and re-enter to override.' },
        { status: 409 }
      );
    }

    const { pnl, pnlPct } = computeOptionPnl(entry.entryCmp, exitCmp);

    // Race-safe: only set the exit if it is still null in the DB. If the auto-close
    // cron won the race between the read above and this write, count === 0 and we
    // report the conflict instead of double-writing.
    const write = await prisma.tradeJournal.updateMany({
      where: { id, exitCmp: null },
      data: { exitCmp, exitTime: new Date(), pnl, pnlPct },
    });

    if (write.count === 0) {
      return NextResponse.json(
        { error: 'Exit already recorded. Delete and re-enter to override.' },
        { status: 409 }
      );
    }

    await TradeJournalService.classifyExecutionOutcome(id);

    const updated = await prisma.tradeJournal.findUnique({ where: { id } });
    return NextResponse.json({ success: true, entry: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — remove a journal entry so a wrong exit (manual or auto-closed) can be
// corrected via the documented "delete and re-enter" flow. Without this handler the
// 409 message in PATCH pointed at a workflow that did not exist, leaving bad exits
// permanently frozen.
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get('id') || undefined;

    if (!id) {
      // Allow id in the JSON body too, for clients that can't send a query string.
      try {
        const body = await request.json();
        if (body && typeof body.id === 'string') id = body.id;
      } catch {
        // no body — fall through to the validation error below
      }
    }

    if (!id) {
      return NextResponse.json(
        { error: 'id is required (query param ?id= or JSON body { id })' },
        { status: 400 }
      );
    }

    const deleted = await prisma.tradeJournal.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      return NextResponse.json(
        { error: `Journal entry not found: ${id}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
