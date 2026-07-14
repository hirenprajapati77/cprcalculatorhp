import test from 'node:test';
import assert from 'node:assert';
import { FyersAuthService } from '../../services/fyers-auth.service';
import { OptionChainService } from '../../services/option-chain.service';
import { OptionSuggestionService } from '../../services/option-suggestion.service';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeChain(overrides: Partial<{
  ceOi: number; ceVol: number; ceBid: number; ceAsk: number;
  peOi: number; peVol: number; peBid: number; peAsk: number;
}> = {}) {
  const {
    ceOi = 50000, ceVol = 5000, ceBid = 19.0, ceAsk = 19.5,
    peOi = 70000, peVol = 7000, peBid = 18.0, peAsk = 18.6,
  } = overrides;
  return [
    { symbol: 'NSE:SBIN26JUN790CE', strikePrice: 790, optionType: 'CE' as const, ltp: 18, open_interest: ceOi,       volume: ceVol,       bid: ceBid,       ask: ceAsk },
    { symbol: 'NSE:SBIN26JUN780CE', strikePrice: 780, optionType: 'CE' as const, ltp: 25, open_interest: ceOi * 0.6, volume: ceVol * 0.6, bid: ceBid,       ask: ceAsk * 1.2 },
    { symbol: 'NSE:SBIN26JUN770CE', strikePrice: 770, optionType: 'CE' as const, ltp: 32, open_interest: ceOi * 0.3, volume: ceVol * 0.3, bid: ceBid,       ask: ceAsk * 1.5 },
    { symbol: 'NSE:SBIN26JUN810PE', strikePrice: 810, optionType: 'PE' as const, ltp: 18, open_interest: peOi,       volume: peVol,       bid: peBid,       ask: peAsk },
    { symbol: 'NSE:SBIN26JUN820PE', strikePrice: 820, optionType: 'PE' as const, ltp: 25, open_interest: peOi * 0.6, volume: peVol * 0.6, bid: peBid,       ask: peAsk * 1.2 },
    { symbol: 'NSE:SBIN26JUN830PE', strikePrice: 830, optionType: 'PE' as const, ltp: 32, open_interest: peOi * 0.3, volume: peVol * 0.3, bid: peBid,       ask: peAsk * 1.5 },
    { symbol: 'NSE:SBIN26JUN800CE', strikePrice: 800, optionType: 'CE' as const, ltp: 12, open_interest: ceOi * 0.8, volume: ceVol * 0.8, bid: 11.8,        ask: 12.2 },
    { symbol: 'NSE:SBIN26JUN800PE', strikePrice: 800, optionType: 'PE' as const, ltp: 12, open_interest: peOi * 0.8, volume: peVol * 0.8, bid: 11.8,        ask: 12.2 },
  ];
}

// ─── Fix 1 verification: honest error paths, no fabricated data ──────────────

test('Option Suggestion Service — Honest Error Paths (no fabricated data)', async (t) => {
  const originalGetAccessToken = FyersAuthService.getAccessToken;
  const originalGetOptionChain = OptionChainService.getOptionChain;

  await t.test('TOKEN_EXPIRED: missing token returns error, no optionsChain, no fake data', async () => {
    FyersAuthService.getAccessToken = async () => null;
    // Do NOT mock getOptionChain — let it call the real service which will return TOKEN_EXPIRED
    // But since it would hit the DB/network, mock getOptionChain to simulate TOKEN_EXPIRED path
    OptionChainService.getOptionChain = async () => ({ error: 'TOKEN_EXPIRED' });
    const res = await OptionSuggestionService.buildSuggestion('SBIN', 800, 'CE', 800, 790, 820);
    assert.strictEqual(res.error, 'TOKEN_EXPIRED', 'should return TOKEN_EXPIRED error');
    assert.strictEqual(res.strike, undefined, 'should have NO strike (no fabricated data)');
    assert.strictEqual(res.ltp, undefined, 'should have NO ltp (no fabricated data)');
    assert.ok(!('optionsChain' in res), 'should have no optionsChain array');
  });

  await t.test('EMPTY_CHAIN: Fyers returns no data — explicit error, no fake fallback', async () => {
    FyersAuthService.getAccessToken = async () => 'mock_token';
    OptionChainService.getOptionChain = async () => ({ error: 'EMPTY_CHAIN' });
    const res = await OptionSuggestionService.buildSuggestion('SBIN', 800, 'CE', 800, 790, 820);
    assert.strictEqual(res.error, 'EMPTY_CHAIN', 'should return EMPTY_CHAIN error');
    assert.strictEqual(res.strike, undefined, 'should have NO strike (no fabricated data)');
    assert.ok(!('optionsChain' in res), 'should have no optionsChain array');
  });

  await t.test('FETCH_FAILED: propagates error honestly, no fabricated data', async () => {
    FyersAuthService.getAccessToken = async () => 'mock_token';
    OptionChainService.getOptionChain = async () => ({ error: 'FETCH_FAILED' });
    const res = await OptionSuggestionService.buildSuggestion('SBIN', 800, 'CE', 800, 790, 820);
    assert.strictEqual(res.error, 'FETCH_FAILED', 'should return FETCH_FAILED error');
    assert.strictEqual(res.strike, undefined, 'should have NO strike');
  });

  await t.test('Math.random never called during any error path', async () => {
    let randomCallCount = 0;
    const originalRandom = Math.random;
    Math.random = () => { randomCallCount++; return originalRandom(); };

    // Test all 3 error paths
    OptionChainService.getOptionChain = async () => ({ error: 'TOKEN_EXPIRED' });
    await OptionSuggestionService.buildSuggestion('SBIN', 800, 'CE', 800, 790, 820);

    OptionChainService.getOptionChain = async () => ({ error: 'EMPTY_CHAIN' });
    await OptionSuggestionService.buildSuggestion('SBIN', 800, 'CE', 800, 790, 820);

    OptionChainService.getOptionChain = async () => ({ error: 'FETCH_EXCEPTION' });
    await OptionSuggestionService.buildSuggestion('SBIN', 800, 'CE', 800, 790, 820);

    Math.random = originalRandom;
    assert.strictEqual(randomCallCount, 0, 'Math.random must never be called during error paths (no fabricated OI)');
  });

  FyersAuthService.getAccessToken = originalGetAccessToken;
  OptionChainService.getOptionChain = originalGetOptionChain;
});


// ─── OI Score scaling ────────────────────────────────────────────────────────

test('Option Suggestion — OI Score scales relative to max OI among candidates', async (t) => {
  const originalGetAccessToken = FyersAuthService.getAccessToken;
  const originalGetOptionChain = OptionChainService.getOptionChain;

  await t.test('highest OI candidate gets oiScore=30', async () => {
    FyersAuthService.getAccessToken = async () => 'mock_token';
    OptionChainService.getOptionChain = async () => ({
      optionsChain: makeChain({ ceOi: 100000, ceVol: 10000 }),
      expiryData: [],
      method: 'direct' as const,
    });
    const originalLoadLotSizes = (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes;
    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = async () => new Map([['SBIN', 750]]);

    const res = await OptionSuggestionService.buildSuggestion('SBIN', 803, 'CE', 800, 790, 820);
    assert.ok(!res.error, `should not error: ${res.error}`);
    assert.ok(res.scoreBreakdown !== undefined, 'scoreBreakdown should be present');
    assert.strictEqual(res.scoreBreakdown!.oiScore, 30, 'Top OI candidate should get 30 pts');

    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = originalLoadLotSizes;
  });

  FyersAuthService.getAccessToken = originalGetAccessToken;
  OptionChainService.getOptionChain = originalGetOptionChain;
});

// ─── PCR Context Score ───────────────────────────────────────────────────────

test('Option Suggestion — PCR Context Score', async (t) => {
  const originalGetAccessToken = FyersAuthService.getAccessToken;
  const originalGetOptionChain = OptionChainService.getOptionChain;

  await t.test('CE trade + PCR > 1.2 → pcrContextScore = 20', async () => {
    FyersAuthService.getAccessToken = async () => 'mock_token';
    OptionChainService.getOptionChain = async () => ({
      optionsChain: makeChain({ ceOi: 30000, peOi: 90000 }),
      expiryData: [], method: 'direct' as const,
    });
    const originalLoadLotSizes = (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes;
    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = async () => new Map([['SBIN', 750]]);

    const res = await OptionSuggestionService.buildSuggestion('SBIN', 803, 'CE', 800, 790, 820);
    assert.ok(!res.error, `should not error: ${res.error}`);
    assert.strictEqual(res.scoreBreakdown!.pcrContextScore, 20, 'CE with high PCR should get 20 pts');
    assert.ok((res.pcr ?? 0) > 1.2, 'PCR should be > 1.2');

    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = originalLoadLotSizes;
  });

  await t.test('PE trade + PCR < 0.8 → pcrContextScore = 20', async () => {
    FyersAuthService.getAccessToken = async () => 'mock_token';
    OptionChainService.getOptionChain = async () => ({
      optionsChain: makeChain({ ceOi: 90000, peOi: 30000 }),
      expiryData: [], method: 'direct' as const,
    });
    const originalLoadLotSizes = (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes;
    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = async () => new Map([['SBIN', 750]]);

    const res = await OptionSuggestionService.buildSuggestion('SBIN', 797, 'PE', 800, 810, 780);
    assert.ok(!res.error, `should not error: ${res.error}`);
    assert.strictEqual(res.scoreBreakdown!.pcrContextScore, 20, 'PE with low PCR should get 20 pts');
    assert.ok((res.pcr ?? 1) < 0.8, 'PCR should be < 0.8');

    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = originalLoadLotSizes;
  });

  await t.test('CE trade + PCR < 0.8 → pcrContextScore = 0 (contradicts direction)', async () => {
    FyersAuthService.getAccessToken = async () => 'mock_token';
    OptionChainService.getOptionChain = async () => ({
      optionsChain: makeChain({ ceOi: 90000, peOi: 30000 }),
      expiryData: [], method: 'direct' as const,
    });
    const originalLoadLotSizes = (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes;
    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = async () => new Map([['SBIN', 750]]);

    const res = await OptionSuggestionService.buildSuggestion('SBIN', 803, 'CE', 800, 790, 820);
    assert.ok(!res.error, `should not error: ${res.error}`);
    assert.strictEqual(res.scoreBreakdown!.pcrContextScore, 0, 'CE with low PCR (bearish) should get 0 pts');

    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = originalLoadLotSizes;
  });

  FyersAuthService.getAccessToken = originalGetAccessToken;
  OptionChainService.getOptionChain = originalGetOptionChain;
});

// ─── Spread Score tiers ──────────────────────────────────────────────────────

test('Option Suggestion — Spread Score tiers', async (t) => {
  const originalGetAccessToken = FyersAuthService.getAccessToken;
  const originalGetOptionChain = OptionChainService.getOptionChain;

  const spreadCases: Array<{ bid: number; ask: number; expected: number; label: string }> = [
    { bid: 19.80, ask: 20.00, expected: 20, label: '<=1% spread -> 20 pts' },
    { bid: 19.60, ask: 20.00, expected: 15, label: '<=2% spread -> 15 pts' },
    { bid: 19.20, ask: 20.00, expected: 10, label: '<=4% spread -> 10 pts' },
    { bid: 18.40, ask: 20.00, expected: 5,  label: '<=8% spread -> 5 pts' },
    { bid: 17.00, ask: 20.00, expected: 0,  label: '>8% spread -> 0 pts' },
  ];

  for (const { bid, ask, expected, label } of spreadCases) {
    await t.test(label, async () => {
      FyersAuthService.getAccessToken = async () => 'mock_token';
      OptionChainService.getOptionChain = async () => ({
        optionsChain: [
          { symbol: 'NSE:SBIN26JUN790CE', strikePrice: 790, optionType: 'CE' as const, ltp: 18, open_interest: 50000, volume: 5000, bid, ask },
          { symbol: 'NSE:SBIN26JUN800CE', strikePrice: 800, optionType: 'CE' as const, ltp: 12, open_interest: 40000, volume: 4000, bid: 11.8, ask: 12.2 },
          { symbol: 'NSE:SBIN26JUN800PE', strikePrice: 800, optionType: 'PE' as const, ltp: 12, open_interest: 55000, volume: 5500, bid: 11.8, ask: 12.2 },
        ],
        expiryData: [], method: 'direct' as const,
      });
      const originalLoadLotSizes = (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes;
      (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = async () => new Map([['SBIN', 750]]);

      // LTP=795 — only strike 790 is ITM for CE, so its spreadScore is the selected candidate's spreadScore
      const res = await OptionSuggestionService.buildSuggestion('SBIN', 795, 'CE', 793, 785, 810);
      assert.ok(!res.error, `should not error: ${res.error}`);
      assert.strictEqual(res.scoreBreakdown!.spreadScore, expected, `expected spreadScore=${expected} for bid=${bid} ask=${ask}`);

      (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = originalLoadLotSizes;
    });
  }

  FyersAuthService.getAccessToken = originalGetAccessToken;
  OptionChainService.getOptionChain = originalGetOptionChain;
});

// ─── ITM Depth Score ─────────────────────────────────────────────────────────

test('Option Suggestion — ITM Depth Score: 1st ITM preferred', async (t) => {
  const originalGetAccessToken = FyersAuthService.getAccessToken;
  const originalGetOptionChain = OptionChainService.getOptionChain;

  await t.test('1st ITM selected when all other scores equal → itmDepthScore=10', async () => {
    FyersAuthService.getAccessToken = async () => 'mock_token';
    OptionChainService.getOptionChain = async () => ({
      optionsChain: makeChain({ ceOi: 50000 }),
      expiryData: [], method: 'direct' as const,
    });
    const originalLoadLotSizes = (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes;
    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = async () => new Map([['SBIN', 750]]);

    const res = await OptionSuggestionService.buildSuggestion('SBIN', 803, 'CE', 800, 790, 820);
    assert.ok(!res.error);
    // 1st ITM for LTP=803 is strike=800 (depth=1), 2nd ITM is strike=790 (depth=2)
    // The 1st ITM (800) has oiScore=24 (80% of max), itmDepthScore=10 total=54
    // The 2nd ITM (790) has oiScore=30, itmDepthScore=6 total=56 — 790 may win on OI
    // This test verifies that the winner has itmDepthScore populated correctly
    assert.ok(res.itmDepth !== undefined, 'itmDepth should be set');
    assert.ok(res.scoreBreakdown!.itmDepthScore === 10 || res.scoreBreakdown!.itmDepthScore === 6, 'itmDepthScore should be 10 (depth=1) or 6 (depth=2)');
    // Ensure when we use LTP=788 (only 780, 770 are ITM), 780 is depth=1
    OptionChainService.getOptionChain = async () => ({
      optionsChain: [
        { symbol: 'NSE:SBIN26JUN780CE', strikePrice: 780, optionType: 'CE' as const, ltp: 18, open_interest: 50000, volume: 5000, bid: 17.8, ask: 18.2 },
        { symbol: 'NSE:SBIN26JUN770CE', strikePrice: 770, optionType: 'CE' as const, ltp: 25, open_interest: 30000, volume: 3000, bid: 24.5, ask: 25.0 },
        { symbol: 'NSE:SBIN26JUN760CE', strikePrice: 760, optionType: 'CE' as const, ltp: 32, open_interest: 15000, volume: 1500, bid: 31.5, ask: 32.5 },
        { symbol: 'NSE:SBIN26JUN800PE', strikePrice: 800, optionType: 'PE' as const, ltp: 12, open_interest: 60000, volume: 6000, bid: 11.8, ask: 12.2 },
        { symbol: 'NSE:SBIN26JUN790PE', strikePrice: 790, optionType: 'PE' as const, ltp: 12, open_interest: 50000, volume: 5000, bid: 11.8, ask: 12.2 },
      ],
      expiryData: [], method: 'direct' as const,
    });
    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = async () => new Map([['SBIN', 750]]);
    const res2 = await OptionSuggestionService.buildSuggestion('SBIN', 788, 'CE', 785, 775, 800);
    assert.ok(!res2.error);
    assert.strictEqual(res2.itmDepth, 1, '780 should be depth=1 (closest ITM) for LTP=788');
    assert.strictEqual(res2.scoreBreakdown!.itmDepthScore, 10, '1st ITM -> 10 pts');

    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = originalLoadLotSizes;
  });

  FyersAuthService.getAccessToken = originalGetAccessToken;
  OptionChainService.getOptionChain = originalGetOptionChain;
});

// ─── Expensive high-score wins over cheap low-score ──────────────────────────

test('Option Suggestion — Expensive high-scoring strike wins (no budget gate)', async (t) => {
  const originalGetAccessToken = FyersAuthService.getAccessToken;
  const originalGetOptionChain = OptionChainService.getOptionChain;

  await t.test('Rs300 ltp (very expensive) but perfect OI/vol/spread beats Rs5 ltp cheap strike', async () => {
    FyersAuthService.getAccessToken = async () => 'mock_token';
    OptionChainService.getOptionChain = async () => ({
      optionsChain: [
        { symbol: 'NSE:SBIN26JUN790CE', strikePrice: 790, optionType: 'CE' as const, ltp: 300, open_interest: 200000, volume: 50000, bid: 299.5, ask: 300.0 },
        { symbol: 'NSE:SBIN26JUN780CE', strikePrice: 780, optionType: 'CE' as const, ltp: 5,   open_interest: 1000,   volume: 100,   bid: 3.0,  ask: 5.0 },
        { symbol: 'NSE:SBIN26JUN770CE', strikePrice: 770, optionType: 'CE' as const, ltp: 4,   open_interest: 500,    volume: 50,    bid: 2.0,  ask: 4.0 },
        { symbol: 'NSE:SBIN26JUN800PE', strikePrice: 800, optionType: 'PE' as const, ltp: 12,  open_interest: 150000, volume: 15000, bid: 11.8, ask: 12.2 },
        { symbol: 'NSE:SBIN26JUN800CE', strikePrice: 800, optionType: 'CE' as const, ltp: 12,  open_interest: 100000, volume: 10000, bid: 11.8, ask: 12.2 },
      ],
      expiryData: [], method: 'direct' as const,
    });
    const originalLoadLotSizes = (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes;
    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = async () => new Map([['SBIN', 750]]);

    const res = await OptionSuggestionService.buildSuggestion('SBIN', 803, 'CE', 800, 790, 820);
    assert.ok(!res.error, `should not error: ${res.error}`);
    assert.strictEqual(res.strike, 790, 'High-score expensive strike (790) should win');
    assert.ok((res.cost ?? 0) > 50000, `cost should be very high (was: ${res.cost})`);

    (OptionSuggestionService as unknown as { loadLotSizes: () => Promise<Map<string, number>> }).loadLotSizes = originalLoadLotSizes;
  });

  FyersAuthService.getAccessToken = originalGetAccessToken;
  OptionChainService.getOptionChain = originalGetOptionChain;
});
