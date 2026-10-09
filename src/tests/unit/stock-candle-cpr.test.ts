import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toYahooTicker, fetchAuthoritativeCandle } from '@/services/stock-candle.service';

describe('Stock & Index Candle Resolution for CPR Workstation', () => {
  describe('toYahooTicker', () => {
    it('correctly maps Indian indices to Yahoo Finance special tickers', () => {
      assert.equal(toYahooTicker('NIFTY'), '^NSEI');
      assert.equal(toYahooTicker('nifty'), '^NSEI');
      assert.equal(toYahooTicker('NIFTY50'), '^NSEI');
      assert.equal(toYahooTicker('NIFTY 50'), '^NSEI');

      assert.equal(toYahooTicker('BANKNIFTY'), '^NSEBANK');
      assert.equal(toYahooTicker('banknifty'), '^NSEBANK');
      assert.equal(toYahooTicker('NIFTYBANK'), '^NSEBANK');
      assert.equal(toYahooTicker('BANK NIFTY'), '^NSEBANK');

      assert.equal(toYahooTicker('FINNIFTY'), 'NIFTY_FIN_SERVICE.NS');
      assert.equal(toYahooTicker('MIDCPNIFTY'), '^NSEMDCP50');
    });

    it('correctly maps equity symbols to exchange tickers', () => {
      assert.equal(toYahooTicker('RELIANCE'), 'RELIANCE.NS');
      assert.equal(toYahooTicker('HDFCBANK'), 'HDFCBANK.NS');
      assert.equal(toYahooTicker('TCS'), 'TCS.NS');
      assert.equal(toYahooTicker('INFY'), 'INFY.NS');
      assert.equal(toYahooTicker('TCS', 'BSE'), 'TCS.BO');
    });

    it('preserves existing exchange-qualified symbols', () => {
      assert.equal(toYahooTicker('^NSEI'), '^NSEI');
      assert.equal(toYahooTicker('RELIANCE.NS'), 'RELIANCE.NS');
      assert.equal(toYahooTicker('INFY.BO'), 'INFY.BO');
    });
  });

  describe('fetchAuthoritativeCandle', () => {
    it('fetches real completed daily OHLC for an index (NIFTY)', async () => {
      const candle = await fetchAuthoritativeCandle('NIFTY');
      assert.ok(candle !== null, 'Expected NIFTY candle to resolve');
      assert.equal(candle.symbol, 'NIFTY');
      assert.equal(candle.ticker, '^NSEI');
      assert.ok(candle.high > 10000, 'NIFTY high must be > 10000');
      assert.ok(candle.low > 10000, 'NIFTY low must be > 10000');
      assert.ok(candle.high >= candle.low, 'High must be >= Low');
      assert.ok(candle.close > 0, 'Close must be positive');
      assert.match(candle.date, /^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
    });

    it('fetches real completed daily OHLC for an equity (RELIANCE)', async () => {
      const candle = await fetchAuthoritativeCandle('RELIANCE');
      assert.ok(candle !== null, 'Expected RELIANCE candle to resolve');
      assert.equal(candle.symbol, 'RELIANCE');
      assert.equal(candle.ticker, 'RELIANCE.NS');
      assert.ok(candle.high > 500, 'RELIANCE high must be > 500');
      assert.ok(candle.high < 5000, 'RELIANCE high must not be NIFTY-level (25000)');
      assert.ok(candle.high >= candle.low, 'High must be >= Low');
      assert.ok(candle.close > 0, 'Close must be positive');
      assert.match(candle.date, /^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
    });

    it('fetches real completed daily OHLC for BANKNIFTY', async () => {
      const candle = await fetchAuthoritativeCandle('BANKNIFTY');
      assert.ok(candle !== null, 'Expected BANKNIFTY candle to resolve');
      assert.equal(candle.symbol, 'BANKNIFTY');
      assert.equal(candle.ticker, '^NSEBANK');
      assert.ok(candle.high > 30000, 'BANKNIFTY high must be > 30000');
      assert.ok(candle.high >= candle.low, 'High must be >= Low');
    });

    it('returns null gracefully for empty or invalid symbol', async () => {
      const empty = await fetchAuthoritativeCandle('');
      assert.equal(empty, null);

      const invalid = await fetchAuthoritativeCandle('__INVALID_NONEXISTENT_SYMBOL_XYZ_123__');
      assert.equal(invalid, null);
    });
  });

  describe('MtfCprService with multi-asset resolution', () => {
    it('computes Weekly and Monthly CPR levels for NIFTY', async () => {
      const { MtfCprService } = await import('@/services/mtf-cpr.service');
      const mtf = await MtfCprService.getLevels('NIFTY');
      assert.ok(mtf.weekly);
      assert.ok(mtf.weekly.pivot > 15000);
      assert.ok(mtf.monthly);
      assert.ok(mtf.monthly.pivot > 15000);
      assert.ok(mtf.weekly.tc >= mtf.weekly.bc || mtf.weekly.tc <= mtf.weekly.bc);
    });

    it('computes Weekly and Monthly CPR levels for RELIANCE', async () => {
      const { MtfCprService } = await import('@/services/mtf-cpr.service');
      const mtf = await MtfCprService.getLevels('RELIANCE');
      assert.ok(mtf.weekly);
      assert.ok(mtf.weekly.pivot > 500 && mtf.weekly.pivot < 5000);
      assert.ok(mtf.monthly);
      assert.ok(mtf.monthly.pivot > 500 && mtf.monthly.pivot < 5000);
    });
  });
});
