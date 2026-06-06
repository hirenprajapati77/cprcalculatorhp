import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const history = await prisma.scanHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    const formatted = history.map((h) => ({
      ...h,
      filters: h.filtersJson ? JSON.parse(h.filtersJson) : {},
    }));

    return NextResponse.json({
      success: true,
      results: formatted,
    }, { status: 200 });
  } catch (err) {
    console.error('Error fetching scan history logs:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching scan logs' },
      { status: 500 }
    );
  }
}
