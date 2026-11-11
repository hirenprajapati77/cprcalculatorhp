import assert from 'node:assert/strict';
import test from 'node:test';
import { TradeJournalService } from '@/services/journal/trade-journal.service';

test('TradeJournalService.fetchUnderlyingCmp index and stock routing', async (t) => {
  await t.test('resolves live quote for NIFTY index symbol', async () => {
    const ltp = await TradeJournalService.fetchUnderlyingCmp('NIFTY');
    assert.ok(typeof ltp === 'number' && ltp > 10000, `NIFTY LTP should be positive number, got ${ltp}`);
  });

  await t.test('resolves live quote for BANKNIFTY index symbol', async () => {
    const ltp = await TradeJournalService.fetchUnderlyingCmp('BANKNIFTY');
    assert.ok(typeof ltp === 'number' && ltp > 20000, `BANKNIFTY LTP should be positive number, got ${ltp}`);
  });

  await t.test('resolves live quote for SENSEX index symbol', async () => {
    const ltp = await TradeJournalService.fetchUnderlyingCmp('SENSEX');
    assert.ok(typeof ltp === 'number' && ltp > 30000, `SENSEX LTP should be positive number, got ${ltp}`);
  });

  await t.test('returns null gracefully on non-existent symbol', async () => {
    const ltp = await TradeJournalService.fetchUnderlyingCmp('__NON_EXISTENT_XYZ_123__');
    assert.equal(ltp, null);
  });
});
