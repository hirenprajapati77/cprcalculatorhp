import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const watchlistUpsertSchema = z.object({
  symbol: z.string().trim().min(1),
  starred: z.boolean().optional(),
  pinned: z.boolean().optional(),
  notify: z.boolean().optional(),
});

export async function GET() {
  try {
    const list = await prisma.watchlist.findMany();
    const dict: Record<string, { starred: boolean; pinned: boolean; notify: boolean }> = {};
    for (const item of list) {
      dict[item.symbol] = {
        starred: item.starred,
        pinned: item.pinned,
        notify: item.notify,
      };
    }
    return NextResponse.json(dict);
  } catch (err) {
    console.error('Failed to GET watchlist:', err);
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 });
  }
}

async function upsertWatchlist(req: Request) {
  try {
    const body = await req.json();
    const parsed = watchlistUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid watchlist payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { symbol, starred, pinned, notify } = parsed.data;

    const updated = await prisma.watchlist.upsert({
      where: { symbol },
      update: {
        ...(starred !== undefined && { starred }),
        ...(pinned !== undefined && { pinned }),
        ...(notify !== undefined && { notify }),
      },
      create: {
        symbol,
        starred: starred ?? true,
        pinned: pinned ?? false,
        notify: notify ?? false,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Failed to upsert watchlist:', err);
    return NextResponse.json({ error: 'Failed to update watchlist' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return upsertWatchlist(req);
}

/** Alias for clients that send PATCH (watchlist page pin/notify toggles). */
export async function PATCH(req: Request) {
  return upsertWatchlist(req);
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) return NextResponse.json({ error: 'Symbol required' }, { status: 400 });

    await prisma.watchlist.delete({ where: { symbol } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to DELETE watchlist:', err);
    return NextResponse.json({ error: 'Failed to delete watchlist' }, { status: 500 });
  }
}
