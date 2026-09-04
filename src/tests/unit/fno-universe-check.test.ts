import test from 'node:test';
import assert from 'node:assert';
import { FnoUniverseCheckService } from '../../services/fno-universe-check.service';
import { MarketService } from '../../services/market.service';

const originalFetch = global.fetch;
const originalGetRawUniverse = MarketService.getRawUniverse;

const mockRawUniverse = [
  { symbol: 'HDFCBANK    ', name: 'HDFC Bank', sector: 'Finance', marketCap: 100, isNifty50: true, isNifty200: true, isFnO: true },
  { symbol: 'RELIANCE    ', name: 'Reliance Industries', sector: 'Energy', marketCap: 200, isNifty50: true, isNifty200: true, isFnO: true },
  { symbol: 'NONFNO      ', name: 'Not FNO', sector: 'IT', marketCap: 50, isNifty50: false, isNifty200: false, isFnO: false }
   
] as any[];

function setupMocks(csvContent?: string, fetchOk = true, fetchStatus = 200) {
  MarketService.getRawUniverse = () => [...mockRawUniverse];
  global.fetch = async () => ({
    ok: fetchOk,
    status: fetchStatus,
    text: async () => csvContent || ''
     
  }) as any;
}

function restoreMocks() {
  global.fetch = originalFetch;
  MarketService.getRawUniverse = originalGetRawUniverse;
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
});
