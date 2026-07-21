import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STOCK_OVERNIGHT_INSTRUMENT_WHERE } from '../../lib/overnight-instrument-filter';

describe('STOCK_OVERNIGHT_INSTRUMENT_WHERE', () => {
  it('excludes INDEX instrumentType so stock overnight queries stay isolated', () => {
    assert.deepEqual(STOCK_OVERNIGHT_INSTRUMENT_WHERE, {
      NOT: { instrumentType: 'INDEX' },
    });
  });
});
