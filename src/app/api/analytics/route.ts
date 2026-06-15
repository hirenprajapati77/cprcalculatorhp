import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('runId');

  if (!runId) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 });
  }

  try {
    const snapshots = await prisma.backtestMetricSnapshot.findMany({
      where: { backtestRunId: runId },
      orderBy: { period: 'asc' }
    });

    // Group by metricType
    const grouped = snapshots.reduce((acc: Record<string, typeof snapshots>, curr) => {
      if (!acc[curr.metricType]) acc[curr.metricType] = [];
      acc[curr.metricType].push(curr);
      return acc;
    }, {});

    return NextResponse.json(grouped);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
