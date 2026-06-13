import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/watchlist
export async function GET() {
  try {
    const list = await prisma.watchlist.findMany({
      orderBy: [
        { pinned: 'desc' },
        { createdAt: 'desc' }
      ]
    });
    return NextResponse.json({ success: true, watchlist: list }, { status: 200 });
  } catch (err) {
    console.error('Failed to get watchlist:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/watchlist
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const cleanSymbol = symbol.trim().toUpperCase();

    const existing = await prisma.watchlist.findUnique({
      where: { symbol: cleanSymbol }
    });

    if (existing) {
      return NextResponse.json({ success: true, item: existing }, { status: 200 });
    }

    const created = await prisma.watchlist.create({
      data: {
        symbol: cleanSymbol,
        pinned: false,
        notify: false,
      }
    });

    return NextResponse.json({ success: true, item: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to add to watchlist:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE /api/watchlist
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol parameter is required' }, { status: 400 });
    }

    const cleanSymbol = symbol.trim().toUpperCase();

    await prisma.watchlist.deleteMany({
      where: { symbol: cleanSymbol }
    });

    return NextResponse.json({ success: true, message: `${cleanSymbol} removed from watchlist` }, { status: 200 });
  } catch (err) {
    console.error('Failed to delete from watchlist:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PATCH /api/watchlist
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, pinned, notify } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const cleanSymbol = symbol.trim().toUpperCase();

    const data: Record<string, boolean> = {};
    if (typeof pinned === 'boolean') data.pinned = pinned;
    if (typeof notify === 'boolean') data.notify = notify;

    const updated = await prisma.watchlist.update({
      where: { symbol: cleanSymbol },
      data,
    });

    return NextResponse.json({ success: true, item: updated }, { status: 200 });
  } catch (err) {
    console.error('Failed to update watchlist item:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
