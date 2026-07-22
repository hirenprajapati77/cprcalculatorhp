import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STOCK_OVERNIGHT_INSTRUMENT_WHERE,
  INDEX_OVERNIGHT_INSTRUMENT_WHERE,
} from '../../lib/overnight-instrument-filter';

describe('STOCK_OVERNIGHT_INSTRUMENT_WHERE', () => {
  it('excludes INDEX instrumentType so stock overnight queries stay isolated', () => {
    assert.deepEqual(STOCK_OVERNIGHT_INSTRUMENT_WHERE, {
      NOT: { instrumentType: 'INDEX' },
    });
  });
});

describe('INDEX_OVERNIGHT_INSTRUMENT_WHERE', () => {
  it('selects INDEX instrumentType only', () => {
    assert.deepEqual(INDEX_OVERNIGHT_INSTRUMENT_WHERE, {
      instrumentType: 'INDEX',
    });
  });
});
