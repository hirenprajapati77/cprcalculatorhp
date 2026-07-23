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

const FALLBACK_LOT_SIZES: Record<string, number> = {
  'NIFTY': 25, 'BANKNIFTY': 15, 'SENSEX': 10, 'FINNIFTY': 40, 'MIDCPNIFTY': 75,
  'HDFCBANK': 400, 'RELIANCE': 250, 'ICICIBANK': 700, 'INFY': 400,
  'ITC': 1600, 'TCS': 175, 'LT': 300, 'SBIN': 750, 'BAJFINANCE': 125,
  'BHARTIARTL': 950, 'KOTAKBANK': 400, 'AXISBANK': 625, 'M&M': 350,
  'MARUTI': 50, 'TATAMOTORS': 1425, 'SUNPHARMA': 700, 'ASIANPAINT': 200,
  'TITAN': 175, 'HINDUNILVR': 300, 'BAJAJFINSV': 500, 'WIPRO': 1500,
  'HCLTECH': 700, 'ULTRACEMCO': 100, 'NTPC': 3000, 'TATASTEEL': 5500,
  'POWERGRID': 3600, 'INDUSINDBK': 500, 'NESTLEIND': 400, 'GRASIM': 475,
  'TECHM': 600, 'ADANIENT': 300, 'ADANIPORTS': 800, 'ONGC': 3850,
  'HINDALCO': 1400, 'JSWSTEEL': 675, 'DRREDDY': 125, 'CIPLA': 650,
  'DIVISLAB': 200, 'APOLLOHOSP': 125, 'EICHERMOT': 175, 'HEROMOTOCO': 300,
  'BAJAJ-AUTO': 125, 'BRITANNIA': 200, 'TATACONSUM': 900, 'COALINDIA': 4200,
  'BPCL': 1800, 'SHRIRAMFIN': 300, 'TRENT': 400, 'BEL': 3800, 'HAL': 300
};

export class OptionSuggestionService {
  /**
   * When true, suggestOptionForBtst (Index BTST path only) biases strike selection toward
   * itmDepth === 2 (second-closest ITM strike) instead of the default itmDepth === 1.
   * Rationale: shallower ITM (depth=1) carries more extrinsic/theta value relative to intrinsic;
   * depth=2 has higher intrinsic fraction, reducing overnight theta drag.
   *
   * Currently set to false (reverts to itmDepth=1 preference) after evaluation showed
   * depth=1 performed acceptably across tested expiry cycles. Set to true to re-enable
   * the deeper ITM preference without any further code changes.
   * Does NOT affect suggestOption (stock BTST/STBT path) — that always uses the original scoring.
   */
  public static readonly INDEX_BTST_PREFER_DEEPER_ITM = false;
  /**
   * Constructs the Fyers option symbol expiry token for both BSE (SENSEX) and NSE (NIFTY/BANKNIFTY) index options.
   * 
   * Format rules:
   * - Monthly contracts (last expiry of calendar month): YY + 3-letter month (e.g., 26JUL, 26AUG, 26SEP, 26DEC).
   * - Weekly contracts (non-last expiry): YY + monthChar + DD (e.g., 26723, 26804, 26811).
   * 
   * Note: Weekly O/N/D encoding for Oct/Nov/Dec (month 10 -> 'O', 11 -> 'N', 12 -> 'D') follows Fyers
   * standard symbology convention, unverified against live data since weeklies >5 weeks out are not
   * currently issued by the exchange.
   */
  private static getFyersSymbolExpiryToken(date: Date, isMonthly: boolean): string {
    const yy = date.getFullYear().toString().slice(2);
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate().toString().padStart(2, '0');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

    if (isMonthly) {
      return `${yy}${months[date.getMonth()]}`;
    } else {
      const monthChar = month === 10 ? 'O' : month === 11 ? 'N' : month === 12 ? 'D' : month.toString();
      return `${yy}${monthChar}${day}`;
    }
  }

  private static async loadLotSizes(): Promise<Map<string, number>> {
    const cacheKey = 'fyers_lot_sizes_map';
    try {
      const cached = await CacheService.get<Record<string, number>>(cacheKey);
      if (cached) {
        const map = new Map(Object.entries(cached));
        for (const [sym, size] of Object.entries(FALLBACK_LOT_SIZES)) {
          if (!map.has(sym)) map.set(sym, size);
        }
        return map;
      }
    } catch (e) {
      console.warn('[OptionSuggestion] Failed to get lot sizes from cache, fetching...', e);
    }

    const lotSizesMap = new Map<string, number>();
    try {
      console.log('[OptionSuggestion] Downloading Fyers symbol master for lot sizes...');
      // 5s timeout prevents hanging the first enrichment call if Fyers CDN is slow at market open.
      const csvController = new AbortController();
      const csvTimeout = setTimeout(() => csvController.abort(), 5000);
      let res: Response;
      try {
        res = await fetch('https://public.fyers.in/sym_details/NSE_FO.csv', { signal: csvController.signal });
      } finally {
        clearTimeout(csvTimeout);
      }
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
              const match = symbol.match(/(?:NSE|BSE):([A-Z0-9_\-&]+)\d{2}[A-Z]{3}/);
              if (match) {
                lotSizesMap.set(match[1], lotSize);
              }
              const futMatch = symbol.match(/(?:NSE|BSE):([A-Z0-9_\-&]+)\d{2}[A-Z]{3}FUT/);
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

    // Always merge fallback lot sizes (ensuring SENSEX, NIFTY, etc. are always populated even if CSV format lacks BSE)
    for (const [sym, size] of Object.entries(FALLBACK_LOT_SIZES)) {
      if (!lotSizesMap.has(sym)) {
        lotSizesMap.set(sym, size);
      }
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
    type: 'CE' | 'PE',
    preferDeeperItm: boolean = false
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

    // 5. ITM Depth Score (max 10):
    //    Default (preferDeeperItm=false): prefer depth 1 (closest-to-spot, most liquid)
    //    Deeper ITM (preferDeeperItm=true): prefer depth 2 (higher intrinsic fraction,
    //    lower theta-to-intrinsic ratio — used for Index BTST CE path only)
    const itmDepthScore = preferDeeperItm
      ? (candidate.itmDepth === 2 ? 10 : candidate.itmDepth === 1 ? 6 : 3)
      : (candidate.itmDepth === 1 ? 10 : candidate.itmDepth === 2 ? 6 : 3);

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
    stockTarget: number,
    preferDeeperItm: boolean = false
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
    let lotSizeKey = cleanSym;
    if (lotSizeKey === 'SENSEX') lotSizeKey = 'BSESENSEX';
    const lotSize = lotSizes.get(cleanSym) || lotSizes.get(lotSizeKey) || lotSizes.get('BSESENSEX') || lotSizes.get('SENSEX');
    if (!lotSize) {
      return { error: 'LOT_SIZE_UNAVAILABLE' };
    }

    // 3. Find the nearest valid expiry after today (weekly or monthly — closest date wins)
    let targetExpiryStr = '';
    if (chainRes.expiryData && chainRes.expiryData.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let nearestExpiry: Date | null = null;
      for (const exObj of chainRes.expiryData) {
        const exStr = typeof exObj === 'string' ? exObj : ((exObj as {date?: string, expiryDate?: string, expiry?: string}).date || (exObj as {date?: string, expiryDate?: string, expiry?: string}).expiryDate || (exObj as {date?: string, expiryDate?: string, expiry?: string}).expiry);
        if (!exStr) continue;
        let parsedDate: Date | null = null;
        if (exStr.match(/^\d{4}-\d{2}-\d{2}$/)) parsedDate = new Date(exStr);
        else if (exStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
          const [d, m, y] = exStr.split('-');
          parsedDate = new Date(`${y}-${m}-${d}`);
        } else {
          const d = new Date(exStr);
          if (!isNaN(d.getTime())) {
            parsedDate = d;
          } else {
            console.warn(`[OptionSuggestion] Unknown expiry date format: "${exStr}" — skipping. Update parser if Fyers API format changed.`);
          }
        }
        if (parsedDate && !isNaN(parsedDate.getTime())) {
          parsedDate.setHours(0, 0, 0, 0);
          if (parsedDate.getTime() > today.getTime()) {
            if (!nearestExpiry || parsedDate.getTime() < nearestExpiry.getTime()) {
              nearestExpiry = parsedDate;
            }
          }
        }
      }
      if (nearestExpiry) {
        // Derive isMonthly: nearestExpiry is monthly if it equals the max expiry date in its (year, month) group
        const targetYear = nearestExpiry.getFullYear();
        const targetMonth = nearestExpiry.getMonth();
        let maxTimeInMonth = -1;

        for (const exObj of chainRes.expiryData) {
          const exStr = typeof exObj === 'string' ? exObj : ((exObj as {date?: string, expiryDate?: string, expiry?: string}).date || (exObj as {date?: string, expiryDate?: string, expiry?: string}).expiryDate || (exObj as {date?: string, expiryDate?: string, expiry?: string}).expiry);
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
            if (parsedDate.getFullYear() === targetYear && parsedDate.getMonth() === targetMonth) {
              if (parsedDate.getTime() > maxTimeInMonth) {
                maxTimeInMonth = parsedDate.getTime();
              }
            }
          }
        }

        const isMonthly = maxTimeInMonth > 0 && nearestExpiry.getTime() === maxTimeInMonth;
        targetExpiryStr = this.getFyersSymbolExpiryToken(nearestExpiry, isMonthly);
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
      .map(c => this.scoreCandidate(c, itmCandidates, pcr, type, preferDeeperItm))
      .sort((a, b) => b.score - a.score);

    console.log(`[OptionSuggestion] ${cleanSym} ${type} scored candidates:`, scored.map(c => ({
      strike: c.option.strikePrice, depth: c.itmDepth, score: c.score, breakdown: c.scoreBreakdown
    })));

    // 7. Select highest-scoring candidate — verify it actually has meaningful data
    const selected = scored[0];
    if (!selected) {
      return { error: 'NO_VIABLE_STRIKES' };
    }
    
    // Ensure we aren't just blindly picking the closest ITM when Fyers returns 0 OI/Volume for everything
    if ((selected.scoreBreakdown.oiScore + selected.scoreBreakdown.volumeScore) === 0) {
      console.warn(`[OptionSuggestion] Rejected candidate ${selected.option.symbol}: OI and Volume scores are both 0. Missing data?`);
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

  /**
   * Stock BTST/STBT path — uses original itmDepth=1 preference (preferDeeperItm=false).
   * Do not change this default; stock liquidity favours the closest ITM strike.
   */
  public static async suggestOption(
    symbol: string,
    ltp: number,
    bias: 'BULLISH' | 'BEARISH',
    stockEntry: number,
    stockSl: number,
    stockTarget: number
  ): Promise<OptionSuggestion> {
    const type = bias === 'BEARISH' ? 'PE' : 'CE';
    return this.buildSuggestion(symbol, ltp, type, stockEntry, stockSl, stockTarget, false);
  }

  /**
   * Index BTST path — applies INDEX_BTST_PREFER_DEEPER_ITM flag.
   * When true (default): biases toward itmDepth=2 to reduce theta drag on overnight holds.
   * When false: reverts to original itmDepth=1 preference, identical to suggestOption behaviour.
   */
  public static async suggestOptionForBtst(
    symbol: string,
    ltp: number,
    tag: 'LONG' | 'SHORT',
    stockEntry: number,
    stockSl: number,
    stockTarget: number
  ): Promise<OptionSuggestion> {
    const type = tag === 'SHORT' ? 'PE' : 'CE';
    return this.buildSuggestion(
      symbol, ltp, type, stockEntry, stockSl, stockTarget,
      OptionSuggestionService.INDEX_BTST_PREFER_DEEPER_ITM
    );
  }
}
