import { OptionChainService, OptionChainResult } from './option-chain.service';
import { CacheService } from './cache.service';

export interface OptionSuggestion {
  symbol?: string;
  strike?: number;
  type?: 'CE' | 'PE';
  ltp?: number;
  itmDepth?: number;
  momentumScore?: number;
  scoreBreakdown?: {
    oiScore: number;
    pcrContextScore: number;
    volumeScore: number;
    spreadScore: number;
    itmDepthScore: number;
  };
  pcr?: number;
  underlyingLtp?: number;
  formattedName?: string;
  lotSize?: number;
  cost?: number;
  oi?: number;
  volume?: number;
  sl?: number;
  target?: number;
  error?: string;
}

interface ItmCandidate {
  option: OptionChainResult['optionsChain'][0];
  itmDepth: 1 | 2 | 3;
}

interface ScoredCandidate extends ItmCandidate {
  score: number;
  scoreBreakdown: {
    oiScore: number;
    pcrContextScore: number;
    volumeScore: number;
    spreadScore: number;
    itmDepthScore: number;
  };
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
        await CacheService.set(cacheKey, cacheObj, 86400);
        console.log(`[OptionSuggestion] Cached ${lotSizesMap.size} symbols lot sizes.`);
      } else {
        console.error(`[OptionSuggestion] Failed to fetch NSE_FO.csv: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('[OptionSuggestion] Error downloading/parsing lot sizes master:', err);
    }
    return lotSizesMap;
  }

  /**
   * Compute PCR (Put-Call Ratio) across ALL strikes in the option chain.
   * PCR = totalPutOI / totalCallOI
   * PCR > 1.2 → bullish bias building (CE trades favoured)
   * PCR < 0.8 → bearish bias building (PE trades favoured)
   * 0.8–1.2   → neutral
   */
  private static computePCR(allOptions: OptionChainResult['optionsChain']): number {
    const totalPutOI = allOptions
      .filter(o => o.optionType === 'PE')
      .reduce((sum, o) => sum + (o.open_interest || 0), 0);
    const totalCallOI = allOptions
      .filter(o => o.optionType === 'CE')
      .reduce((sum, o) => sum + (o.open_interest || 0), 0);
    return totalCallOI > 0 ? parseFloat((totalPutOI / totalCallOI).toFixed(4)) : 1.0;
  }

  /**
   * Score a single ITM candidate using OI, PCR context, volume, bid-ask spread, and ITM depth.
   * Max 100 points total.
   */
  private static scoreCandidate(
    candidate: ItmCandidate,
    allItmCandidates: ItmCandidate[],
    pcr: number,
    type: 'CE' | 'PE'
  ): ScoredCandidate {
    const opt = candidate.option;

    // 1. OI Level Score (max 30): relative among ITM candidates
    const maxOI = Math.max(...allItmCandidates.map(c => c.option.open_interest || 0));
    const oiScore = maxOI > 0
      ? Math.round(((opt.open_interest || 0) / maxOI) * 30)
      : 0;

    // 2. PCR Context Score (max 20): does chain PCR agree with the trade direction?
    let pcrContextScore: number;
    if (type === 'CE' && pcr > 1.2) {
      pcrContextScore = 20; // bullish bias confirms CE entry
    } else if (type === 'PE' && pcr < 0.8) {
      pcrContextScore = 20; // bearish bias confirms PE entry
    } else if (pcr >= 0.8 && pcr <= 1.2) {
      pcrContextScore = 10; // neutral — partial credit
    } else {
      pcrContextScore = 0; // PCR contradicts direction
    }

    // 3. Volume Score (max 20): relative among ITM candidates
    const maxVolume = Math.max(...allItmCandidates.map(c => c.option.volume || 0));
    const volumeScore = maxVolume > 0
      ? Math.round(((opt.volume || 0) / maxVolume) * 20)
      : 0;

    // 4. Spread Score (max 20): tighter spread = better execution quality
    const bid = opt.bid || 0;
    const ask = opt.ask || 0;
    let spreadScore: number;
    if (ask <= 0) {
      spreadScore = 0; // missing data — penalise fully
    } else {
      const spreadPct = ((ask - bid) / ask) * 100;
      spreadScore = spreadPct <= 1 ? 20
        : spreadPct <= 2 ? 15
        : spreadPct < 4.01 ? 10
        : spreadPct < 8.01 ? 5
        : 0;
    }

    // 5. ITM Depth Score (max 10): prefer 1st ITM (closest to spot)
    const itmDepthScore = candidate.itmDepth === 1 ? 10
      : candidate.itmDepth === 2 ? 6
      : 3;

    const score = oiScore + pcrContextScore + volumeScore + spreadScore + itmDepthScore;

    return {
      ...candidate,
      score,
      scoreBreakdown: { oiScore, pcrContextScore, volumeScore, spreadScore, itmDepthScore },
    };
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

    // 3. Find the target expiry (next valid monthly expiry)
    let targetExpiryStr = '';
    if (chainRes.expiryData && chainRes.expiryData.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (const exObj of chainRes.expiryData) {
        const exStr = typeof exObj === 'string' ? exObj : (exObj.date || exObj.expiryDate || exObj.expiry);
        if (!exStr) continue;
        let parsedDate: Date | null = null;
        if (exStr.match(/^\d{4}-\d{2}-\d{2}$/)) parsedDate = new Date(exStr);
        else if (exStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
          const [d, m, y] = exStr.split('-');
          parsedDate = new Date(`${y}-${m}-${d}`);
        } else {
          const d = new Date(exStr);
          if (!isNaN(d.getTime())) parsedDate = d;
        }
        if (parsedDate && !isNaN(parsedDate.getTime())) {
          parsedDate.setHours(0, 0, 0, 0);
          if (parsedDate.getTime() > today.getTime()) {
            const yy = parsedDate.getFullYear().toString().slice(2);
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const mmm = months[parsedDate.getMonth()];
            targetExpiryStr = `${yy}${mmm}`;
            break;
          }
        }
      }
    }

    // 4. Filter valid options for this type (exclude equity row where strikePrice <= 0) and MUST match target expiry
    const validOptions = chainRes.optionsChain
      .filter(o => o.optionType === type && o.strikePrice > 0 && (!targetExpiryStr || o.symbol.includes(targetExpiryStr)))
      .sort((a, b) => a.strikePrice - b.strikePrice);

    if (validOptions.length === 0) {
      return { error: 'EMPTY_CHAIN' };
    }

    // 4. Compute PCR from the full chain (all strikes, both types, excluding equity row)
    const allValidOptions = chainRes.optionsChain.filter(o => o.strikePrice > 0);
    const pcr = this.computePCR(allValidOptions);
    console.log(`[OptionSuggestion] ${cleanSym} chain PCR: ${pcr} (${pcr > 1.2 ? 'Bullish bias' : pcr < 0.8 ? 'Bearish bias' : 'Neutral'})`);

    // 5. Build ITM candidate pool (up to 3 strikes)
    //    CE ITM = strikes BELOW spot (sorted ascending → highest below spot = last before spot)
    //    PE ITM = strikes ABOVE spot (sorted ascending → lowest above spot = first after spot)
    const itmCandidates: ItmCandidate[] = [];

    if (type === 'CE') {
      // Strikes below LTP, sorted descending (closest first)
      const itmStrikes = validOptions
        .filter(o => o.strikePrice < ltp)
        .sort((a, b) => b.strikePrice - a.strikePrice)
        .slice(0, 3);
      itmStrikes.forEach((opt, idx) => {
        itmCandidates.push({ option: opt, itmDepth: (idx + 1) as 1 | 2 | 3 });
      });
    } else {
      // Strikes above LTP, sorted ascending (closest first)
      const itmStrikes = validOptions
        .filter(o => o.strikePrice > ltp)
        .sort((a, b) => a.strikePrice - b.strikePrice)
        .slice(0, 3);
      itmStrikes.forEach((opt, idx) => {
        itmCandidates.push({ option: opt, itmDepth: (idx + 1) as 1 | 2 | 3 });
      });
    }

    if (itmCandidates.length === 0) {
      return { error: 'EMPTY_CHAIN' };
    }

    // 6. Score all ITM candidates
    const scored: ScoredCandidate[] = itmCandidates
      .map(c => this.scoreCandidate(c, itmCandidates, pcr, type))
      .sort((a, b) => b.score - a.score);

    console.log(`[OptionSuggestion] ${cleanSym} ${type} scored candidates:`, scored.map(c => ({
      strike: c.option.strikePrice, depth: c.itmDepth, score: c.score, breakdown: c.scoreBreakdown
    })));

    // 7. Select highest-scoring candidate — no budget check
    const selected = scored[0];
    if (!selected || selected.score === 0) {
      return { error: 'NO_VIABLE_STRIKES' };
    }

    // 8. Estimate SL / Target using 0.7 delta proxy
    const delta = 0.7;
    const stockMoveTarget = Math.max(0, type === 'CE' ? stockTarget - stockEntry : stockEntry - stockTarget);
    const stockMoveSl = Math.max(0, type === 'CE' ? stockEntry - stockSl : stockSl - stockEntry);

    const optionTarget = parseFloat((selected.option.ltp + stockMoveTarget * delta).toFixed(2));
    const optionSl = parseFloat(Math.max(0.05, selected.option.ltp - stockMoveSl * delta).toFixed(2));
    const cost = parseFloat((selected.option.ltp * lotSize).toFixed(2));

    let expiryStr = '';
    const prefix = `NSE:${cleanSym}`;
    if (selected.option.symbol.startsWith(prefix)) {
      const remainder = selected.option.symbol.substring(prefix.length);
      const suffixStr = `${selected.option.strikePrice}${type}`;
      if (remainder.endsWith(suffixStr)) {
        expiryStr = remainder.substring(0, remainder.length - suffixStr.length);
      }
    }
    const finalFormattedName = expiryStr 
      ? `${cleanSym} ${expiryStr} ${selected.option.strikePrice} ${type}` 
      : `${cleanSym} ${selected.option.strikePrice} ${type}`;

    return {
      symbol: selected.option.symbol,
      strike: selected.option.strikePrice,
      type,
      ltp: selected.option.ltp,
      itmDepth: selected.itmDepth,
      momentumScore: selected.score,
      scoreBreakdown: selected.scoreBreakdown,
      pcr,
      underlyingLtp: ltp,
      formattedName: finalFormattedName,
      lotSize,
      cost,
      oi: selected.option.open_interest ?? 0,
      volume: selected.option.volume ?? 0,
      sl: optionSl,
      target: optionTarget,
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
