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
    const grouped = snapshots.reduce((acc: any, curr) => {
      if (!acc[curr.metricType]) acc[curr.metricType] = [];
      acc[curr.metricType].push(curr);
      return acc;
    }, {});

    return NextResponse.json(grouped);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
