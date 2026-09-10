import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma, type OvernightSignal } from '@prisma/client';
import { prisma } from '@/lib/db';
import { env } from '@/config/env';
import {
  indexClassificationToQualityBucket,
  selectTradableIndexBtstPicks,
  selectTradableIndexStbtPicks,
  persistIndexBtstOvernightSignals,
} from '../../services/overnight/index-overnight-persist';

describe('index-overnight-persist (Tier 2 coverage)', () => {
  describe('indexClassificationToQualityBucket', () => {
    it('maps INDEX_STRONG and INDEX_READY to TRADEABLE', () => {
      assert.equal(indexClassificationToQualityBucket('INDEX_STRONG'), 'TRADEABLE');
      assert.equal(indexClassificationToQualityBucket('INDEX_READY'), 'TRADEABLE');
    });

    it('maps INDEX_WATCH to WATCHLIST', () => {
      assert.equal(indexClassificationToQualityBucket('INDEX_WATCH'), 'WATCHLIST');
    });

    it('maps IGNORE to LOW_QUALITY', () => {
      assert.equal(indexClassificationToQualityBucket('IGNORE'), 'LOW_QUALITY');
    });

    it('returns null for unknown classification', () => {
      assert.equal(indexClassificationToQualityBucket('UNKNOWN'), null);
      assert.equal(indexClassificationToQualityBucket(''), null);
    });
  });

  describe('selectTradableIndexBtstPicks', () => {
    const mockSignal = (overrides: Partial<OvernightSignal>): OvernightSignal => ({
      id: 'sig-1',
      symbol: 'NIFTY',
      signalDate: '2026-09-09',
      signalTime: '15:10',
      direction: 'LONG',
      instrumentType: 'INDEX',
      classification: 'INDEX_STRONG',
      overnightScore: 82,
      confidence: 82,
      entry: 25000,
      stopLoss: 24800,
      target: 25400,
      qualityBucket: 'TRADEABLE',
      exitStrategy: 'EOD',
      createdAt: new Date(),
      ...overrides,
    }) as OvernightSignal;

    it('selects top tradable LONG index picks sorted by score', () => {
      const signals: OvernightSignal[] = [
        mockSignal({ id: 's1', symbol: 'NIFTY', overnightScore: 85 }),
        mockSignal({ id: 's2', symbol: 'BANKNIFTY', overnightScore: 90 }),
        mockSignal({ id: 's3', symbol: 'SENSEX', overnightScore: 78 }),
      ];

      const picks = selectTradableIndexBtstPicks(signals, { minScore: 75, take: 2 });
      assert.equal(picks.length, 2);
      assert.equal(picks[0].symbol, 'BANKNIFTY');
      assert.equal(picks[1].symbol, 'NIFTY');
    });

    it('returns empty array if suppressLong is true or INDEX_BTST_ENABLED is false', () => {
      const signals: OvernightSignal[] = [mockSignal({ id: 's1', symbol: 'NIFTY' })];

      const suppressed = selectTradableIndexBtstPicks(signals, { suppressLong: true });
      assert.deepEqual(suppressed, []);

      const originalEnv = env.INDEX_BTST_ENABLED;
      try {
        env.INDEX_BTST_ENABLED = false;
        const disabled = selectTradableIndexBtstPicks(signals);
        assert.deepEqual(disabled, []);
      } finally {
        env.INDEX_BTST_ENABLED = originalEnv;
      }
    });

    it('filters out signals with invalid entry or stopLoss or score below minScore', () => {
      const signals: OvernightSignal[] = [
        mockSignal({ id: 's1', symbol: 'NIFTY', entry: 0 }),
        mockSignal({ id: 's2', symbol: 'BANKNIFTY', stopLoss: null as unknown as number }),
        mockSignal({ id: 's3', symbol: 'SENSEX', overnightScore: 50 }),
      ];

      const picks = selectTradableIndexBtstPicks(signals, { minScore: 75 });
      assert.equal(picks.length, 0);
    });

    it('filters out stock instruments and short direction from BTST picks', () => {
      const signals: OvernightSignal[] = [
        mockSignal({ id: 's1', symbol: 'RELIANCE', instrumentType: 'STOCK' }),
        mockSignal({ id: 's2', symbol: 'NIFTY', direction: 'SHORT' }),
        mockSignal({ id: 's3', symbol: 'NIFTY', classification: 'IGNORE' }),
      ];

      const picks = selectTradableIndexBtstPicks(signals);
      assert.equal(picks.length, 0);
    });
  });

  describe('selectTradableIndexStbtPicks', () => {
    const mockShortSignal = (overrides: Partial<OvernightSignal>): OvernightSignal => ({
      id: 'sig-short-1',
      symbol: 'NIFTY',
      signalDate: '2026-09-09',
      signalTime: '15:10',
      direction: 'SHORT',
      instrumentType: 'INDEX',
      classification: 'INDEX_STRONG',
      overnightScore: 84,
      confidence: 84,
      entry: 25000,
      stopLoss: 25200,
      target: 24600,
      qualityBucket: 'TRADEABLE',
      exitStrategy: 'EOD',
      createdAt: new Date(),
      ...overrides,
    }) as OvernightSignal;

    it('selects top tradable SHORT index picks', () => {
      const signals: OvernightSignal[] = [
        mockShortSignal({ id: 's1', symbol: 'NIFTY', overnightScore: 80 }),
        mockShortSignal({ id: 's2', symbol: 'BANKNIFTY', overnightScore: 88 }),
      ];

      const picks = selectTradableIndexStbtPicks(signals, { minScore: 75, take: 2 });
      assert.equal(picks.length, 2);
      assert.equal(picks[0].symbol, 'BANKNIFTY');
      assert.equal(picks[1].symbol, 'NIFTY');
    });

    it('returns empty array if suppressShort is true or INDEX_STBT_ENABLED is false', () => {
      const signals: OvernightSignal[] = [mockShortSignal({ id: 's1', symbol: 'NIFTY' })];

      const suppressed = selectTradableIndexStbtPicks(signals, { suppressShort: true });
      assert.deepEqual(suppressed, []);

      const originalEnv = env.INDEX_STBT_ENABLED;
      try {
        env.INDEX_STBT_ENABLED = false;
        const disabled = selectTradableIndexStbtPicks(signals);
        assert.deepEqual(disabled, []);
      } finally {
        env.INDEX_STBT_ENABLED = originalEnv;
      }
    });

    it('filters out signals with invalid entry or stopLoss or score below minScore', () => {
      const signals: OvernightSignal[] = [
        mockShortSignal({ id: 's1', symbol: 'NIFTY', entry: null as unknown as number }),
        mockShortSignal({ id: 's2', symbol: 'BANKNIFTY', target: null as unknown as number }),
        mockShortSignal({ id: 's3', symbol: 'SENSEX', overnightScore: 60 }),
      ];

      const picks = selectTradableIndexStbtPicks(signals, { minScore: 75 });
      assert.equal(picks.length, 0);
    });
  });

  describe('persistIndexBtstOvernightSignals', () => {
    it('upserts signals and gracefully absorbs Prisma P2002 unique constraint violations', async () => {
      const origUpsert = prisma.overnightSignal.upsert;
      const upsertArgs: unknown[] = [];
      let callCount = 0;

      prisma.overnightSignal.upsert = (async (args: unknown) => {
        upsertArgs.push(args);
        callCount++;
        if (callCount === 2) {
          // Simulate concurrent worker collision throwing P2002
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '6.0.0',
          });
        }
        return {} as OvernightSignal;
      }) as typeof prisma.overnightSignal.upsert;

      try {
        const mockResults: any[] = [
          {
            symbol: 'NIFTY',
            signalDate: '2026-09-09',
            signalTime: '15:10',
            direction: 'LONG',
            entry: 25000,
            stopLoss: 24800,
            target: 25400,
            score: 85,
            confidence: 85,
            classification: 'INDEX_STRONG',
          },
          {
            symbol: 'BANKNIFTY',
            signalDate: '2026-09-09',
            signalTime: '15:10',
            direction: 'LONG',
            entry: 51000,
            stopLoss: 50700,
            target: 51600,
            score: 80,
            confidence: 80,
            classification: 'INDEX_READY',
          },
        ];

        // Should complete without throwing despite P2002 on second item
        await persistIndexBtstOvernightSignals(mockResults);
        assert.equal(upsertArgs.length, 2, 'Both signals should have attempted upsert');
      } finally {
        prisma.overnightSignal.upsert = origUpsert;
      }
    });

    it('re-throws non-P2002 errors', async () => {
      const origUpsert = prisma.overnightSignal.upsert;
      prisma.overnightSignal.upsert = (async () => {
        throw new Error('Database connection lost');
      }) as unknown as typeof prisma.overnightSignal.upsert;

      try {
        const mockResults: any[] = [
          {
            symbol: 'NIFTY',
            signalDate: '2026-09-09',
            signalTime: '15:10',
            direction: 'LONG',
            entry: 25000,
            stopLoss: 24800,
            target: 25400,
            score: 85,
            classification: 'INDEX_STRONG',
          },
        ];

        await assert.rejects(
          async () => persistIndexBtstOvernightSignals(mockResults),
          /Database connection lost/
        );
      } finally {
        prisma.overnightSignal.upsert = origUpsert;
      }
    });
  });
});
