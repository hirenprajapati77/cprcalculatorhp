import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { MarketSnapshot, ScannerResult } from '@prisma/client';
import { getISTDateString } from '@/lib/market-hours';

interface Props {
  params: Promise<{ symbol: string }>;
}

export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { symbol } = await params;

    if (!symbol) {
      return NextResponse.json({ error: 'Stock symbol is required' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();

    // 1. Fetch historical scans for this stock (supporting both NSE and BSE suffix keying)
    const history = await prisma.scannerResult.findMany({
      where: {
        OR: [
          { symbol: upperSymbol },
          { symbol: `${upperSymbol}:BSE` }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    if (history.length === 0) {
      return NextResponse.json(
        { error: `No historical scan results found for stock: ${upperSymbol}` },
        { status: 404 }
      );
    }

    const current = history[0];
    const currentSignals = current.signalSummary ? current.signalSummary.split(',') : [];

    // 2. Query Sector Peers for Relative Comparison Metrics
    let sectorPeers: { symbol: string; price: number; width: number; score: number; classification: string }[] = [];
    let sectorAverageWidth = current.width;
    let sectorAverageScore = current.score;
    let sectorName = 'Unassigned';

    // Retrieve metadata snapshot to identify the sector of this stock
    const currentSnapshot = await prisma.marketSnapshot.findUnique({
      where: { symbol: current.symbol },
    });

    if (currentSnapshot && currentSnapshot.sector) {
      sectorName = currentSnapshot.sector;
      const today = getISTDateString();
      
      // Get all peer snapshot symbol maps
      const peerSnapshots = await prisma.marketSnapshot.findMany({
        where: {
          sector: currentSnapshot.sector,
          symbol: { not: current.symbol },
        },
      });
      
      const peerSymbols = peerSnapshots.map((p: MarketSnapshot) => p.symbol);

      if (peerSymbols.length > 0) {
        const peers = await prisma.scannerResult.findMany({
          where: {
            symbol: { in: peerSymbols },
            date: today,
          },
        });

        if (peers.length > 0) {
          const totalWidth = peers.reduce((sum: number, p: ScannerResult) => sum + p.width, 0) + current.width;
          const totalScore = peers.reduce((sum: number, p: ScannerResult) => sum + p.score, 0) + current.score;
          const count = peers.length + 1;
          
          sectorAverageWidth = totalWidth / count;
          sectorAverageScore = totalScore / count;
          sectorPeers = peers.map((p: ScannerResult) => {
            const cleanPeerSymbol = p.symbol.split(':')[0];
            return {
              symbol: cleanPeerSymbol,
              price: p.ltp,
              width: p.width,
              score: p.score,
              classification: p.classification,
            };
          });
        }
      }
    }

    // 3. Compile Response (remove suffixes for clean UI mapping)
    const cleanSymbol = current.symbol.split(':')[0];
    const response = {
      symbol: cleanSymbol,
      sector: sectorName,
      market: current.symbol.includes(':BSE') ? 'BSE' : 'NSE',
      current: {
        ...current,
        symbol: cleanSymbol,
        price: currentSnapshot ? currentSnapshot.price : current.ltp,
        signal: current.signalSummary,
        signals: currentSignals,
      },
      history: history.map((h: ScannerResult) => ({
        ...h,
        symbol: cleanSymbol,
        signals: h.signalSummary ? h.signalSummary.split(',') : [],
      })),
      comparison: {
        sectorAverageWidth,
        sectorAverageScore,
        stockWidthSpread: current.width - sectorAverageWidth,
        stockScoreSpread: current.score - sectorAverageScore,
        peers: sectorPeers,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('Error fetching stock comparison data:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred while retrieving stock info' },
      { status: 500 }
    );
  }
}
