import test from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { GET } from '../../app/api/options/chain/route';
import { OptionChainService } from '../../services/option-chain.service';

test('/api/options/chain route handler (CRITICAL-08)', async (t) => {
  const originalGetOptionChain = OptionChainService.getOptionChain;

  await t.test('missing symbol returns 400 Bad Request', async () => {
    const req = new NextRequest('http://localhost:3000/api/options/chain');
    const res = await GET(req);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, 'Symbol parameter is required');
  });

  await t.test('OptionChainService returning error returns 400 Bad Request', async () => {
    OptionChainService.getOptionChain = async () => ({ error: 'TOKEN_EXPIRED' });
    try {
      const req = new NextRequest('http://localhost:3000/api/options/chain?symbol=NIFTY');
      const res = await GET(req);
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.success, false);
      assert.strictEqual(body.error, 'TOKEN_EXPIRED');
    } finally {
      OptionChainService.getOptionChain = originalGetOptionChain;
    }
  });

  await t.test('OptionChainService returning chain returns 200 OK with data', async () => {
    const mockChainData = {
      optionsChain: [
        { symbol: 'NSE:NIFTY26JUL24000CE', strikePrice: 24000, optionType: 'CE' as const, ltp: 100 },
      ],
      expiryData: [{ date: '2026-07-30', expiry: '30 JUL 2026' }],
      method: 'direct' as const,
    };
    OptionChainService.getOptionChain = async () => mockChainData as unknown as Awaited<ReturnType<typeof OptionChainService.getOptionChain>>;
    try {
      const req = new NextRequest('http://localhost:3000/api/options/chain?symbol=NIFTY&allowRollover=true');
      const res = await GET(req);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.deepStrictEqual(body.data, mockChainData);
    } finally {
      OptionChainService.getOptionChain = originalGetOptionChain;
    }
  });
});
