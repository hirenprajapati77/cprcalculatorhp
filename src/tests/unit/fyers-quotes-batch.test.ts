import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFyersQuotesUrl,
  chunkSymbols,
  fromFyersEquitySymbol,
  FYERS_QUOTES_MAX_PER_REQUEST,
  parseFyersQuotesResponse,
  toFyersEquitySymbol,
} from '@/services/fyers-quotes-batch';

test('fyers-quotes-batch helpers', async (t) => {
  await t.test('toFyersEquitySymbol / fromFyersEquitySymbol round-trip', () => {
    assert.equal(toFyersEquitySymbol('reliance', 'NSE'), 'NSE:RELIANCE-EQ');
    assert.equal(toFyersEquitySymbol('SBIN', 'BSE'), 'BSE:SBIN-EQ');
    assert.equal(fromFyersEquitySymbol('NSE:RELIANCE-EQ'), 'RELIANCE');
    assert.equal(fromFyersEquitySymbol('BSE:SBIN-EQ'), 'SBIN');
    assert.equal(fromFyersEquitySymbol('bad'), null);
  });

  await t.test('chunkSymbols respects Fyers max of 50', () => {
    const items = Array.from({ length: 120 }, (_, i) => `S${i}`);
    const chunks = chunkSymbols(items, 50);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0]!.length, 50);
    assert.equal(chunks[1]!.length, 50);
    assert.equal(chunks[2]!.length, 20);

    const capped = chunkSymbols(items, 200);
    assert.ok(capped.every((c) => c.length <= FYERS_QUOTES_MAX_PER_REQUEST));
  });

  await t.test('buildFyersQuotesUrl joins comma-separated symbols', () => {
    const url = buildFyersQuotesUrl(['NSE:A-EQ', 'NSE:B-EQ']);
    assert.ok(url.includes('api-t1.fyers.in/data/quotes'));
    assert.ok(url.includes('symbols='));
    assert.ok(url.includes('NSE') && url.includes('A-EQ') && url.includes('B-EQ'));
  });

  await t.test('parseFyersQuotesResponse skips bad rows and keeps valid LTP', () => {
    const parsed = parseFyersQuotesResponse(
      {
        s: 'ok',
        d: [
          { n: 'NSE:GOOD-EQ', s: 'ok', v: { lp: 100, open_price: 99, volume: 10 } },
          { n: 'NSE:BAD-EQ', s: 'error', v: { lp: 50 } },
          { n: 'NSE:NOLP-EQ', s: 'ok', v: { open_price: 1 } },
          { n: 'BSE:OTHER-EQ', s: 'ok', v: { lp: 12 } },
        ],
      },
      'NSE'
    );
    assert.equal(parsed.size, 1);
    assert.equal(parsed.get('GOOD')?.lp, 100);
    assert.equal(parsed.get('GOOD')?.open_price, 99);
    assert.equal(parsed.get('GOOD')?.volume, 10);
  });
});
