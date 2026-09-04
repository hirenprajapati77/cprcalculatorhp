import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BACKFILL_MIN_ROWS,
  resolveBackfillMinRows,
} from '../../../scripts/market-tools/bhavcopy-backfill';

describe('bhavcopy-backfill row threshold', () => {
  const originalEnv = process.env.BACKFILL_MIN_ROWS;

  beforeEach(() => {
    delete process.env.BACKFILL_MIN_ROWS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.BACKFILL_MIN_ROWS = originalEnv;
    } else {
      delete process.env.BACKFILL_MIN_ROWS;
    }
  });

  it('defaults to 1800 rows matching standard daily EQ series volume (~2050-2150 symbols)', () => {
    assert.equal(DEFAULT_BACKFILL_MIN_ROWS, 1800);
    assert.equal(resolveBackfillMinRows(), 1800);
  });

  it('allows overriding via BACKFILL_MIN_ROWS for truncated sessions (e.g. Muhurat trading)', () => {
    process.env.BACKFILL_MIN_ROWS = '1000';
    assert.equal(resolveBackfillMinRows(), 1000);

    process.env.BACKFILL_MIN_ROWS = '1200';
    assert.equal(resolveBackfillMinRows(), 1200);
  });

  it('falls back to 1800 if BACKFILL_MIN_ROWS is invalid or non-numeric', () => {
    process.env.BACKFILL_MIN_ROWS = 'invalid';
    assert.equal(resolveBackfillMinRows(), 1800);

    process.env.BACKFILL_MIN_ROWS = '';
    assert.equal(resolveBackfillMinRows(), 1800);
  });
});
