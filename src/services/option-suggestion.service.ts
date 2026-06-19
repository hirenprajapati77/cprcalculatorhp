import { OptionChainService } from './option-chain.service';

export interface OptionSuggestion {
  symbol: string;
  strike: number;
  type: 'CE' | 'PE';
  ltp: number;
  strategy: 'ATM' | 'OTM' | 'ITM';
  underlyingLtp: number;
  formattedName: string;
}

export class OptionSuggestionService {
  public static async buildSuggestion(
    symbol: string,
    ltp: number,
    type: 'CE' | 'PE',
    strategy: 'ATM' | 'OTM' | 'ITM' = 'ATM'
  ): Promise<OptionSuggestion> {
    const increment = OptionChainService.getStrikeIncrement(symbol, ltp);
    const atmStrike = Math.round(ltp / increment) * increment;
    
    let offset = 0;
    if (strategy === 'OTM') {
      offset = type === 'CE' ? 1 : -1;
    } else if (strategy === 'ITM') {
      offset = type === 'CE' ? -1 : 1;
    }
    
    const strike = atmStrike + (offset * increment);
    const optionSymbol = OptionChainService.buildOptionSymbol(symbol, strike, type);
    const optionLtp = await OptionChainService.fetchOptionQuote(optionSymbol, ltp, strike, type);
    
    const cleanSym = symbol.toUpperCase().trim().replace('-EQ', '');
    
    return {
      symbol: optionSymbol,
      strike,
      type,
      ltp: optionLtp,
      strategy,
      underlyingLtp: ltp,
      formattedName: `${cleanSym} ${strike} ${type}`
    };
  }

  public static async suggestOption(
    symbol: string,
    ltp: number,
    bias: 'BULLISH' | 'BEARISH'
  ): Promise<OptionSuggestion> {
    const type = bias === 'BEARISH' ? 'PE' : 'CE';
    return this.buildSuggestion(symbol, ltp, type, 'ATM');
  }

  public static async suggestOptionForBtst(
    symbol: string,
    ltp: number,
    tag: 'LONG' | 'SHORT'
  ): Promise<OptionSuggestion> {
    const type = tag === 'SHORT' ? 'PE' : 'CE';
    return this.buildSuggestion(symbol, ltp, type, 'ATM');
  }
}
