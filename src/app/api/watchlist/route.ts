import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { symbol, starred, pinned, notify } = body;

    if (!symbol) return NextResponse.json({ error: 'Symbol required' }, { status: 400 });

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
    console.error('Failed to POST watchlist:', err);
    return NextResponse.json({ error: 'Failed to update watchlist' }, { status: 500 });
  }
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
