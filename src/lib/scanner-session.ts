import { MarketSessionResolver } from '@/config/market-profile';
import { getSessionState, shouldFreezeBreakouts } from '@/lib/market-hours';
import { MarketService } from '@/services/market.service';

export type ScannerUniverse = 'NIFTY50' | 'NIFTY200' | 'NIFTY_FNO' | 'ALL';

type UniverseSymbolMeta = {
  symbol: string;
  isFnO: boolean;
};

export function getUniverseSymbolMeta(universe: ScannerUniverse): UniverseSymbolMeta[] {
  return MarketService.getUniverse(universe).map((stock) => ({
    symbol: stock.symbol.trim(),
    isFnO: stock.isFnO === true,
  }));
}

export function isUniverseLiveForScanner(universe: ScannerUniverse, date: Date = new Date()): boolean {
  const symbols = getUniverseSymbolMeta(universe);
  return symbols.some((stock) => {
    const ctx = MarketSessionResolver.resolve(stock.symbol, { isFnO: stock.isFnO });
    return getSessionState(date, ctx) === 'LIVE';
  });
}

export function isSymbolFrozenForScanner(
  symbol: string,
  isFnO: boolean,
  date: Date = new Date()
): boolean {
  const ctx = MarketSessionResolver.resolve(symbol, { isFnO });
  return shouldFreezeBreakouts(date, ctx);
}
