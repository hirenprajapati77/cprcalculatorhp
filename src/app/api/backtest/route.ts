import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BacktestService } from '@/services/backtest/backtest.service';
import { prisma } from '@/lib/db';
import { publicApiError } from '@/lib/api-error';

const BacktestSubmitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  universe: z.string().trim().min(1).max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capital: z.number().positive().max(1_000_000_000),
  riskModel: z.enum(['Fixed', 'Risk%', 'Capital%']).optional(),
  executionMode: z.string().trim().min(1).max(40),
  metricsVersion: z.number().int().positive().optional(),
  riskValue: z.number().positive().max(100).optional(),
  strategyMode: z.string().trim().min(1).max(80).optional(),
}).superRefine((data, ctx) => {
  if (data.endDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'endDate must be on or after startDate',
      path: ['endDate'],
    });
  }
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = BacktestSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid backtest payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await BacktestService.submitRun(parsed.data);

    if (result.status === 'UNAVAILABLE') {
      return NextResponse.json({ feature: 'backtest', status: 'unavailable' }, { status: 503 });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('[Backtest POST]', error);
    return NextResponse.json({ error: publicApiError(error, 'Failed to submit backtest') }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get('runId');

    if (runId) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(runId)) {
        return NextResponse.json({ error: 'Invalid runId' }, { status: 400 });
      }
      const run = await prisma.backtestRun.findUnique({
        where: { id: runId },
        include: { metrics: true }
      });
      return NextResponse.json(run);
    }

    const runs = await prisma.backtestRun.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        metrics: true,
        _count: {
          select: { trades: true }
        }
      },
      take: 20
    });

    return NextResponse.json(runs);
  } catch (error: unknown) {
    console.error('[Backtest GET]', error);
    return NextResponse.json({ error: publicApiError(error) }, { status: 500 });
  }
}
