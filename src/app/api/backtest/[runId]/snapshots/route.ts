import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { runId: string } }) {
  try {
    const snapshots = await prisma.backtestMetricSnapshot.findMany({
      where: { backtestRunId: params.runId },
      orderBy: { period: 'asc' }
    });
    return NextResponse.json(snapshots);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
