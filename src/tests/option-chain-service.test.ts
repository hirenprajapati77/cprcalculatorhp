import test from 'node:test';
import assert from 'node:assert';
import { OptionChainService } from '../services/option-chain.service';

test('OptionChainService fetchOptionQuote regex supports &', async (_t) => {
  let fetchedSymbol = '';
  
  // Mock getOptionChain
  const originalGetOptionChain = OptionChainService.getOptionChain;
  OptionChainService.getOptionChain = async (symbol: string) => {
    fetchedSymbol = symbol;
    return {
      expiryData: [],
      optionsChain: [
        { symbol: `NSE:${symbol}25JUL2900CE`, strikePrice: 2900, optionType: 'CE', ltp: 150.5 }
      ],
      method: 'direct'
    };
  };

  try {
    const ltp = await OptionChainService.fetchOptionQuote('NSE:M&M25JUL2900CE');
    assert.strictEqual(ltp, 150.5, 'Should correctly extract LTP');
    assert.strictEqual(fetchedSymbol, 'M&M', 'Should correctly parse underlying symbol with &');
  } finally {
    OptionChainService.getOptionChain = originalGetOptionChain;
  }
});
