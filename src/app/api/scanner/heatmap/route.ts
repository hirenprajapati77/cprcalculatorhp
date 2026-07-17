import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { MarketSnapshot, ScannerResult } from '@prisma/client';
import { getISTDateString } from '@/lib/market-hours';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const today = getISTDateString();

    // 1. Fetch all scan results for today
    const scans = await prisma.scannerResult.findMany({
      where: { date: today },
    });

    if (scans.length === 0) {
      // If no scans today, fetch the latest date available
      const latestResult = await prisma.scannerResult.findFirst({
        orderBy: { date: 'desc' }
      });
      if (latestResult) {
        const latestDate = latestResult.date;
        const fallbackScans = await prisma.scannerResult.findMany({
          where: { date: latestDate }
        });
        scans.push(...fallbackScans);
      }
    }

    // 2. Fetch all market snapshots to get sectors
    const snapshots = await prisma.marketSnapshot.findMany();
    const sectorMap = new Map<string, string>();
    snapshots.forEach((snap: MarketSnapshot) => {
      sectorMap.set(snap.symbol, snap.sector);
    });

    // 3. Aggregate signals by sector
    // Structure: sector -> { signal -> count }
    const counts: Record<string, Record<string, number>> = {};

    scans.forEach((scan: ScannerResult) => {
      const sector = sectorMap.get(scan.symbol) || 'Other';
      const signals = scan.signalSummary ? scan.signalSummary.split(',') : [];

      if (!counts[sector]) {
        counts[sector] = {
          BULLISH: 0,
          BEARISH: 0,
          NARROW: 0,
          WIDE: 0,
          BREAKOUT: 0,
          LONG_BUILD: 0,
          SHORT_BUILD: 0,
          VOLUME_SPIKE: 0,
        };
      }

      signals.forEach((sig: string) => {
        if (counts[sector][sig] !== undefined) {
          counts[sector][sig]++;
        } else {
          // Dynamic signals grouping
          counts[sector][sig] = (counts[sector][sig] || 0) + 1;
        }
      });
    });

    // 4. Format response as a flat array
    const heatmap = Object.entries(counts).map(([sector, signals]) => ({
      sector,
      signals,
    }));

    return NextResponse.json({ success: true, heatmap }, { status: 200 });
  } catch (err) {
    console.error('Heatmap API failed:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
