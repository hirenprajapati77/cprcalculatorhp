import test from 'node:test';
import assert from 'node:assert';
import { FnoUniverseCheckService } from '../../services/fno-universe-check.service';
import { MarketService } from '../../services/market.service';

const originalFetch = global.fetch;
const originalGetRawUniverse = MarketService.getRawUniverse;
const originalGetStaticRawUniverse = MarketService.getStaticRawUniverse;

const mockRawUniverse = [
  { symbol: 'HDFCBANK    ', name: 'HDFC Bank', sector: 'Finance', marketCap: 100, isNifty50: true, isNifty200: true, isFnO: true },
  { symbol: 'RELIANCE    ', name: 'Reliance Industries', sector: 'Energy', marketCap: 200, isNifty50: true, isNifty200: true, isFnO: true },
  { symbol: 'NONFNO      ', name: 'Not FNO', sector: 'IT', marketCap: 50, isNifty50: false, isNifty200: false, isFnO: false }
] as any[];

function setupMocks(csvContent?: string, fetchOk = true, fetchStatus = 200) {
  MarketService.getRawUniverse = () => [...mockRawUniverse];
  MarketService.getStaticRawUniverse = () => [...mockRawUniverse];
  global.fetch = async () => ({
    ok: fetchOk,
    status: fetchStatus,
    text: async () => csvContent || ''
  }) as any;
}

function restoreMocks() {
  global.fetch = originalFetch;
  MarketService.getRawUniverse = originalGetRawUniverse;
  MarketService.getStaticRawUniverse = originalGetStaticRawUniverse;
  MarketService.clearDynamicFnoSymbols();
}

test('FnoUniverseCheckService', async (t) => {
  t.afterEach(restoreMocks);

  await t.test('should return no drift when NSE list perfectly matches local isFnO list', async () => {
    setupMocks(`UNDERLYING,SYMBOL
HDFC BANK,HDFCBANK
RELIANCE INDUSTRIES,RELIANCE`);
    
    const result = await FnoUniverseCheckService.checkDrift();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data?.hasDrift, false);
    assert.strictEqual(result.data?.newlyEligible.length, 0);
    assert.strictEqual(result.data?.newlyIneligible.length, 0);
    assert.strictEqual(result.data?.symbolsOnlyInNse.length, 0);
  });

  await t.test('should flag newly-ineligible stock', async () => {
    // RELIANCE is missing from CSV but isFnO=true locally
    setupMocks(`UNDERLYING,SYMBOL
HDFC BANK,HDFCBANK`);
    
    const result = await FnoUniverseCheckService.checkDrift();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data?.hasDrift, true);
    assert.ok(result.data?.newlyIneligible.includes('RELIANCE    '));
  });

  await t.test('should flag brand-new NSE listing', async () => {
    // NEWCO is not in STOCK_UNIVERSE at all
    setupMocks(`UNDERLYING,SYMBOL
HDFC BANK,HDFCBANK
RELIANCE INDUSTRIES,RELIANCE
NEW COMPANY,NEWCO`);
    
    const result = await FnoUniverseCheckService.checkDrift();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data?.hasDrift, true);
    assert.ok(result.data?.symbolsOnlyInNse.some(s => s.trim() === 'NEWCO'));
  });

  await t.test('should handle fetch failure gracefully', async () => {
    setupMocks('', false, 503);

    const result = await FnoUniverseCheckService.checkDrift();
    assert.strictEqual(result.ok, false);
    assert.ok(result.error?.includes('503'));
  });

  await t.test('should handle case and padding insensitivity', async () => {
    // CSV has lowercase and spaces, local is padded uppercase
    setupMocks(`UNDERLYING,SYMBOL
HDFC BANK, hdfcbank 
RELIANCE INDUSTRIES, ReLiAnCe
NOT FNO, NONFNO`);

    const result = await FnoUniverseCheckService.checkDrift();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data?.hasDrift, true);
    // NONFNO is locally isFnO=false, so it becomes newlyEligible
    assert.ok(result.data?.newlyEligible.some(s => s.trim() === 'NONFNO'));
    // HDFCBANK and RELIANCE should match fine and not cause drift
    assert.strictEqual(result.data?.symbolsOnlyInNse.length, 0);
    assert.strictEqual(result.data?.newlyIneligible.length, 0);
  });

  await t.test('should handle network timeout / abort error gracefully', async () => {
    global.fetch = async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    };

    const result = await FnoUniverseCheckService.checkDrift();
    assert.strictEqual(result.ok, false);
    assert.ok(result.error?.includes('timeout') || result.error?.includes('aborted'));
  });

  await t.test('should synchronize MarketService runtime F&O universe upon successful checkDrift() (Finding 7)', async () => {
    // CSV has HDFCBANK and NONFNO as F&O, RELIANCE is omitted
    setupMocks(`UNDERLYING,SYMBOL
HDFC BANK,HDFCBANK
NON FNO STOCK,NONFNO`);

    const result = await FnoUniverseCheckService.checkDrift();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data?.appliedToRuntime, true);

    const dynamicSymbols = MarketService.getDynamicFnoSymbols();
    assert.ok(dynamicSymbols);
    assert.strictEqual(dynamicSymbols.has('HDFCBANK'), true);
    assert.strictEqual(dynamicSymbols.has('NONFNO'), true);
    assert.strictEqual(dynamicSymbols.has('RELIANCE'), false);
  });

  await t.test('MarketService.getUniverse derives F&O eligibility dynamically with static fallback (Finding 7)', () => {
    // Ensure clean slate
    MarketService.clearDynamicFnoSymbols();

    // 1. Static fallback baseline: in STOCK_UNIVERSE, RELIANCE is isFnO=true, ATGL is isFnO=false
    const staticFno = MarketService.getUniverse('NSE_FNO');
    assert.strictEqual(staticFno.some(s => s.symbol.trim() === 'RELIANCE'), true, 'RELIANCE should be F&O in static baseline');
    assert.strictEqual(staticFno.some(s => s.symbol.trim() === 'ATGL'), false, 'ATGL should NOT be F&O in static baseline');

    // 2. Set dynamic F&O symbols: make ATGL eligible and RELIANCE ineligible
    MarketService.setDynamicFnoSymbols(['ATGL', 'HDFCBANK']);

    const dynamicFno = MarketService.getUniverse('NSE_FNO');
    assert.strictEqual(dynamicFno.some(s => s.symbol.trim() === 'ATGL'), true, 'ATGL should now be in dynamic F&O universe');
    assert.strictEqual(dynamicFno.some(s => s.symbol.trim() === 'RELIANCE'), false, 'RELIANCE should now be excluded from dynamic F&O universe');
    assert.strictEqual(dynamicFno.some(s => s.symbol.trim() === 'HDFCBANK'), true, 'HDFCBANK should remain in dynamic F&O universe');

    // 3. Clear dynamic symbols -> falls back cleanly to static baseline
    MarketService.clearDynamicFnoSymbols();
    const fallbackFno = MarketService.getUniverse('NSE_FNO');
    assert.strictEqual(fallbackFno.some(s => s.symbol.trim() === 'RELIANCE'), true, 'RELIANCE should be restored in static fallback');
    assert.strictEqual(fallbackFno.some(s => s.symbol.trim() === 'ATGL'), false, 'ATGL should be excluded in static fallback');
  });

  await t.test('MarketService.loadDynamicFnoUniverse loads from cache and handles cache misses gracefully (Finding 7)', async () => {
    const { CacheService } = await import('../../services/cache.service');
    const origGet = CacheService.get;

    try {
      // Case A: Cache returns valid symbols
      CacheService.get = (async () => ['SBIN', 'INFY']) as any;
      const loaded = await MarketService.loadDynamicFnoUniverse();
      assert.strictEqual(loaded, true);
      assert.strictEqual(MarketService.getDynamicFnoSymbols()?.has('SBIN'), true);
      assert.strictEqual(MarketService.getDynamicFnoSymbols()?.has('INFY'), true);

      // Case B: Cache returns null (cache miss) -> should return false and not throw
      MarketService.clearDynamicFnoSymbols();
      CacheService.get = (async () => null) as any;
      const missLoaded = await MarketService.loadDynamicFnoUniverse();
      assert.strictEqual(missLoaded, false);
      assert.strictEqual(MarketService.getDynamicFnoSymbols(), null);

      // Case C: Cache throws -> should catch, return false, and not throw
      CacheService.get = (async () => { throw new Error('Redis down'); }) as any;
      const errLoaded = await MarketService.loadDynamicFnoUniverse();
      assert.strictEqual(errLoaded, false);
      assert.strictEqual(MarketService.getDynamicFnoSymbols(), null);
    } finally {
      CacheService.get = origGet;
      MarketService.clearDynamicFnoSymbols();
    }
  });
});
