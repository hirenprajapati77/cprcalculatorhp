import { OptionChainService, OptionChainResult } from './option-chain.service';
import { CacheService } from './cache.service';

export interface OptionSuggestion {
  symbol?: string;
  strike?: number;
  type?: 'CE' | 'PE';
  ltp?: number;
  strategy?: string;
  underlyingLtp?: number;
  formattedName?: string;
  lotSize?: number;
  cost?: number;
  sl?: number;
  target?: number;
  error?: string;
}

export class OptionSuggestionService {
  private static async loadLotSizes(): Promise<Map<string, number>> {
    const cacheKey = 'fyers_lot_sizes_map';
    try {
      const cached = await CacheService.get<Record<string, number>>(cacheKey);
      if (cached) {
        return new Map(Object.entries(cached));
      }
    } catch (e) {
      console.warn('[OptionSuggestion] Failed to get lot sizes from cache, fetching...', e);
    }

    const lotSizesMap = new Map<string, number>();
    try {
      console.log('[OptionSuggestion] Downloading Fyers symbol master for lot sizes...');
      const res = await fetch('https://public.fyers.in/sym_details/NSE_FO.csv');
      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n');
        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length > 10) {
            const symbol = parts[9]?.trim();
            const lotSize = parseInt(parts[3]?.trim(), 10);
            if (symbol && !isNaN(lotSize) && lotSize > 0) {
              lotSizesMap.set(symbol, lotSize);
              const match = symbol.match(/NSE:([A-Z0-9_\-]+)\d{2}[A-Z]{3}/);
              if (match) {
                lotSizesMap.set(match[1], lotSize);
              }
              const futMatch = symbol.match(/NSE:([A-Z0-9_\-]+)\d{2}[A-Z]{3}FUT/);
              if (futMatch) {
                lotSizesMap.set(futMatch[1], lotSize);
              }
            }
          }
        }
        const cacheObj = Object.fromEntries(lotSizesMap);
        await CacheService.set(cacheKey, cacheObj, 86400); // 24 hour cache
        console.log(`[OptionSuggestion] Cached ${lotSizesMap.size} symbols lot sizes.`);
      } else {
        console.error(`[OptionSuggestion] Failed to fetch NSE_FO.csv: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('[OptionSuggestion] Error downloading/parsing lot sizes master:', err);
    }
    return lotSizesMap;
  }

  public static async buildSuggestion(
    symbol: string,
    ltp: number,
    type: 'CE' | 'PE',
    stockEntry: number,
    stockSl: number,
    stockTarget: number
  ): Promise<OptionSuggestion> {
    const cleanSym = symbol.toUpperCase().trim().replace('-EQ', '');
    
    // 1. Fetch Option Chain
    const chainRes = await OptionChainService.getOptionChain(cleanSym);
    if ('error' in chainRes) {
      return { error: chainRes.error };
    }

    if (!chainRes.optionsChain || chainRes.optionsChain.length === 0) {
      return { error: 'EMPTY_CHAIN' };
    }

    // 2. Fetch Lot Size
    const lotSizes = await this.loadLotSizes();
    const lotSize = lotSizes.get(cleanSym);
    if (!lotSize) {
      return { error: 'LOT_SIZE_UNAVAILABLE' };
    }

    // 3. Filter and Sort Options by Strike
    const options = chainRes.optionsChain
      .filter((o) => o.optionType === type)
      .sort((a, b) => a.strikePrice - b.strikePrice);

    if (options.length === 0) {
      return { error: 'EMPTY_CHAIN' };
    }

    // 4. Identify 3 Candidate Strikes (Slightly ITM, ATM, Slightly OTM)
    // Find closest strike index to LTP
    let atmIndex = 0;
    let minDiff = Infinity;
    for (let i = 0; i < options.length; i++) {
      const diff = Math.abs(options[i].strikePrice - ltp);
      if (diff < minDiff) {
        minDiff = diff;
        atmIndex = i;
      }
    }

    const candidates: Array<{ option: typeof options[0]; strategy: string }> = [];

    // Slightly ITM:
    // CE ITM is strike < ltp (lower strike)
    // PE ITM is strike > ltp (higher strike)
    if (type === 'CE') {
      if (atmIndex > 0) candidates.push({ option: options[atmIndex - 1], strategy: 'ITM' }); // Strike below ATM
      candidates.push({ option: options[atmIndex], strategy: 'ATM' });
      if (atmIndex < options.length - 1) candidates.push({ option: options[atmIndex + 1], strategy: 'OTM' }); // Strike above ATM
    } else {
      if (atmIndex < options.length - 1) candidates.push({ option: options[atmIndex + 1], strategy: 'ITM' }); // Strike above ATM
      candidates.push({ option: options[atmIndex], strategy: 'ATM' });
      if (atmIndex > 0) candidates.push({ option: options[atmIndex - 1], strategy: 'OTM' }); // Strike below ATM
    }

    // 5. Budget Matching (₹10,000 to ₹15,000)
    let selected = candidates.find((c) => {
      const cost = c.option.ltp * lotSize;
      return cost >= 10000 && cost <= 15000;
    });

    // Fallback: If no candidate fits exactly, choose the one with cost closest to the budget range
    if (!selected && candidates.length > 0) {
      console.log(`[OptionSuggestion] No strike fits 10k-15k budget for ${cleanSym}. Checking closest...`);
      let bestCandidate = candidates[0];
      let minDistance = Infinity;

      for (const c of candidates) {
        const cost = c.option.ltp * lotSize;
        let distance = 0;
        if (cost < 10000) {
          distance = 10000 - cost;
        } else if (cost > 15000) {
          distance = cost - 15000;
        }
        if (distance < minDistance) {
          minDistance = distance;
          bestCandidate = c;
        }
      }

      // Check if closest option is within a reasonable buffer (e.g. ₹5,000 to ₹25,000)
      const bestCost = bestCandidate.option.ltp * lotSize;
      if (bestCost >= 5000 && bestCost <= 25000) {
        selected = bestCandidate;
      }
    }

    if (!selected) {
      return { error: 'NO_ITM_STRIKES_AVAILABLE' };
    }

    // 6. Estimate SL / Target using 0.7 Delta
    const delta = 0.7;
    const stockMoveTarget = Math.max(0, type === 'CE' ? stockTarget - stockEntry : stockEntry - stockTarget);
    const stockMoveSl = Math.max(0, type === 'CE' ? stockEntry - stockSl : stockSl - stockEntry);

    const optionTarget = parseFloat((selected.option.ltp + stockMoveTarget * delta).toFixed(2));
    const optionSl = parseFloat(Math.max(0.05, selected.option.ltp - stockMoveSl * delta).toFixed(2));
    const cost = parseFloat((selected.option.ltp * lotSize).toFixed(2));

    return {
      symbol: selected.option.symbol,
      strike: selected.option.strikePrice,
      type,
      ltp: selected.option.ltp,
      strategy: selected.strategy,
      underlyingLtp: ltp,
      formattedName: `${cleanSym} ${selected.option.strikePrice} ${type}`,
      lotSize,
      cost,
      sl: optionSl,
      target: optionTarget
    };
  }

  public static async suggestOption(
    symbol: string,
    ltp: number,
    bias: 'BULLISH' | 'BEARISH',
    stockEntry: number,
    stockSl: number,
    stockTarget: number
  ): Promise<OptionSuggestion> {
    const type = bias === 'BEARISH' ? 'PE' : 'CE';
    return this.buildSuggestion(symbol, ltp, type, stockEntry, stockSl, stockTarget);
  }

  public static async suggestOptionForBtst(
    symbol: string,
    ltp: number,
    tag: 'LONG' | 'SHORT',
    stockEntry: number,
    stockSl: number,
    stockTarget: number
  ): Promise<OptionSuggestion> {
    const type = tag === 'SHORT' ? 'PE' : 'CE';
    return this.buildSuggestion(symbol, ltp, type, stockEntry, stockSl, stockTarget);
  }
}
