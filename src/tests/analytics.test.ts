import test from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/analytics/route';
import { prisma } from '../lib/db';

test('Analytics API Route Logic', async (t) => {
  await t.test('Breakeven classification and winRate math is correct', async (t) => {
    // 1. Mock Prisma to return a fixed run and specific trades
    const originalFindUnique = prisma.backtestRun.findUnique;
    const originalFindMany = prisma.trade.findMany;
    
    // @ts-expect-error Mocking Prisma for tests
    prisma.backtestRun.findUnique = async () => {
      return { id: 'mock-run-1', capital: 100000 };
    };
    
    // @ts-expect-error Mocking Prisma for tests
    prisma.trade.findMany = async () => {
      return [
        // 2 Wins
        { id: 't1', backtestRunId: 'mock-run-1', signal: 'CPR', pnl: 100, entryDate: new Date('2026-06-01') },
        { id: 't2', backtestRunId: 'mock-run-1', signal: 'CPR', pnl: 150, entryDate: new Date('2026-06-02') },
        // 1 Loss
        { id: 't3', backtestRunId: 'mock-run-1', signal: 'CPR', pnl: -50, entryDate: new Date('2026-06-03') },
        // 1 Breakeven
        { id: 't4', backtestRunId: 'mock-run-1', signal: 'CPR', pnl: 0, entryDate: new Date('2026-06-04') },
      ];
    };

    // 2. Call the GET endpoint
    const req = new NextRequest('http://localhost/api/analytics?runId=mock-run-1');
    const response = await GET(req);
    const json = await response.json();

    // 3. Verify the signalBreakdown
    assert.strictEqual(response.status, 200, 'Endpoint should return 200 OK');
    assert.ok(json.signalBreakdown, 'Response should contain signalBreakdown');
    
    const cprStats = json.signalBreakdown.find((s: any) => s.signal === 'CPR');
    assert.ok(cprStats, 'CPR stats should exist');
    
    assert.strictEqual(cprStats.wins, 2, 'Should count 2 wins');
    assert.strictEqual(cprStats.losses, 1, 'Should count 1 loss');
    assert.strictEqual(cprStats.breakeven, 1, 'Should count 1 breakeven');
    
    // Win rate = wins / (wins + losses) = 2 / (2 + 1) = 66.67%
    assert.strictEqual(cprStats.winRate.toFixed(2), '66.67', 'Win rate should exclude breakeven from denominator');
    
    // Average PnL = totalPnl / (wins + losses + breakeven) = (100 + 150 - 50 + 0) / 4 = 200 / 4 = 50
    assert.strictEqual(cprStats.avgPnl, 50, 'Avg P&L should include breakeven in denominator');

    // Verify month locale is correct (e.g., Jun instead of localized variant if any)
    assert.strictEqual(json.monthlyPnl[0].month, 'Jun', 'Month should be correctly formatted to en-US short format');
    
    // 4. Restore Prisma
    prisma.backtestRun.findUnique = originalFindUnique;
    prisma.trade.findMany = originalFindMany;
  });
});
