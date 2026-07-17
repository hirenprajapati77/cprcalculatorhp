import test from 'node:test';
import assert from 'node:assert';
import {
  sanitizePagination,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from '../../lib/pagination';

test('sanitizePagination', async (t) => {
  await t.test('accepts valid numeric strings', () => {
    assert.deepStrictEqual(sanitizePagination('2', '25'), { page: 2, limit: 25 });
  });

  await t.test('falls back to defaults on missing values', () => {
    assert.deepStrictEqual(sanitizePagination(null, undefined), {
      page: 1,
      limit: DEFAULT_PAGE_LIMIT,
    });
  });

  await t.test('rejects NaN / garbage input', () => {
    assert.deepStrictEqual(sanitizePagination('abc', 'xyz'), {
      page: 1,
      limit: DEFAULT_PAGE_LIMIT,
    });
  });

  await t.test('rejects zero and negative page (would produce negative Prisma skip)', () => {
    assert.strictEqual(sanitizePagination('0', '10').page, 1);
    assert.strictEqual(sanitizePagination('-5', '10').page, 1);
  });

  await t.test('rejects zero / negative limit', () => {
    assert.strictEqual(sanitizePagination('1', '0').limit, DEFAULT_PAGE_LIMIT);
    assert.strictEqual(sanitizePagination('1', '-20').limit, DEFAULT_PAGE_LIMIT);
  });

  await t.test('caps abusive page sizes at MAX_PAGE_LIMIT', () => {
    assert.strictEqual(sanitizePagination('1', '100000').limit, MAX_PAGE_LIMIT);
  });

  await t.test('floors non-integer values', () => {
    assert.deepStrictEqual(sanitizePagination('2.9', '10.7'), { page: 2, limit: 10 });
  });
});
