import test from 'node:test';
import assert from 'node:assert';
import { CalculationService } from '../../services/calculation.service';
import { cache } from '../../lib/redis';
import { prisma } from '../../lib/db';
import { CalculationRecord, CPRInput } from '../../types/cpr.types';

const input: CPRInput = {
  high: 110,
  low: 100,
  close: 105
};

test('CalculationService caches successful persisted share records', async () => {
  const originalCreate = prisma.calculation.create;
  const originalSet = cache.set;
  const cacheWrites: string[] = [];

  prisma.calculation.create = (async () => ({
    id: 'calc_1',
    ...input,
    pivot: 105,
    bc: 102.5,
    tc: 107.5,
    r1: 110,
    r2: 115,
    r3: 120,
    r4: 125,
    s1: 100,
    s2: 95,
    s3: 90,
    s4: 85,
    width: 0.047619047619047616,
    classification: 'Normal',
    trend: 'Neutral',
    shareToken: 'persisted_token',
    createdAt: new Date()
  })) as typeof originalCreate;

  cache.set = async (key: string) => {
    cacheWrites.push(key);
  };

  try {
    const record = await CalculationService.calculateAndSave(input);

    assert.strictEqual(record.persisted, true);
    assert.deepStrictEqual(cacheWrites, ['calc:share:persisted_token']);
  } finally {
    prisma.calculation.create = originalCreate;
    cache.set = originalSet;
  }
});

test('CalculationService does not cache failed DB writes as share records', async () => {
  const originalCreate = prisma.calculation.create;
  const originalSet = cache.set;
  const cacheWrites: string[] = [];

  prisma.calculation.create = (async () => {
    throw new Error('database unavailable');
  }) as typeof originalCreate;

  cache.set = async (key: string) => {
    cacheWrites.push(key);
  };

  try {
    const record: CalculationRecord = await CalculationService.calculateAndSave(input);

    assert.strictEqual(record.persisted, false);
    assert.match(record.id, /^local_/);
    assert.strictEqual(record.shareToken ? cacheWrites.includes(`calc:share:${record.shareToken}`) : false, false);
    assert.deepStrictEqual(cacheWrites, []);
  } finally {
    prisma.calculation.create = originalCreate;
    cache.set = originalSet;
  }
});
