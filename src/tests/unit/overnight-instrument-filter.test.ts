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

import { IndexDiscoverService } from '../../services/overnight/index-discover.service';

describe('IndexDiscoverService Friday Weekend Gate', () => {
  it('suppresses BTST LONG on Fridays to prevent 60+ hour weekend gap risk', async () => {
    // 2026-07-24 is a Friday
    const fridayDate = new Date('2026-07-24T10:00:00+05:30');
    const results = await IndexDiscoverService.discover(fridayDate);

    const longSignals = results.filter((r) => r.direction === 'LONG');
    assert.ok(longSignals.length > 0, 'Expected index LONG results');
    assert.ok(
      longSignals.every((r) => r.classification === 'IGNORE'),
      'All LONG signals on Friday must be classified as IGNORE'
    );
    assert.ok(
      longSignals.every((r) =>
        r.reasons.some((re) => re.includes('Friday gate active'))
      ),
      'All Friday LONG signals must cite Friday gate suppression'
    );
  });
});
