import { env } from '@/config/env';
import { FyersAuthService } from './fyers-auth.service';
import { CacheService } from './cache.service';

export interface OptionChainResult {
  optionsChain: Array<{
    symbol: string;
    strikePrice: number;
    optionType: 'CE' | 'PE';
    ltp: number;
    open_interest?: number;
    volume?: number;
    bid?: number;
    ask?: number;
  }>;
  expiryData: Array<{
    expiryDate: string;
  }>;
  method: 'direct' | 'proxy';
}

export class OptionChainService {
  public static getStrikeIncrement(symbol: string, price: number): number {
    const cleanSym = symbol.toUpperCase().trim();
    if (cleanSym.includes('BANKNIFTY')) return 100;
    if (cleanSym.includes('SENSEX')) return 100;
    if (cleanSym.includes('FINNIFTY')) return 50;
    if (cleanSym.includes('NIFTY')) return 50;

    if (price < 100) return 1;
    if (price < 250) return 2.5;
    if (price < 500) return 5;
    if (price < 1000) return 10;
    if (price < 5000) return 20;
    if (price < 10000) return 50;
    return 100;
  }


  public static async getOptionChain(symbol: string, allowRollover: boolean = true): Promise<OptionChainResult | { error: string }> {
    const cleanSym = symbol.toUpperCase().trim().replace('-EQ', '');
    const cacheKey = allowRollover ? `option_chain_${cleanSym}_rollover` : `option_chain_${cleanSym}_current`;

    try {
      const cached = await CacheService.get<OptionChainResult>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (err) {
      console.warn('[OptionChain] Cache retrieval failed, proceeding:', err);
    }

    const token = await FyersAuthService.getAccessToken();
    if (!token) {
      console.warn(`[OptionChain] Access token expired or missing for ${cleanSym}`);
      return { error: 'TOKEN_EXPIRED' };
    }

    let appId: string;
    try {
      const creds = FyersAuthService.getCredentials();
      appId = creds.appId;
    } catch (e) {
      console.error('[OptionChain] Failed to load Fyers credentials:', e);
      return { error: 'CREDENTIALS_MISSING' };
    }

    const isIndex = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY'].some(idx => cleanSym.includes(idx));
    const suffix = isIndex ? 'INDEX' : 'EQ';
    const exchange = cleanSym.includes('SENSEX') ? 'BSE' : 'NSE';
    
    let fyersSym = cleanSym;
    if (fyersSym === 'NIFTY') fyersSym = 'NIFTY50';
    if (fyersSym === 'BANKNIFTY') fyersSym = 'NIFTYBANK';
    
    const directUrl = `https://api-t1.fyers.in/data/options-chain-v3?symbol=${encodeURIComponent(`${exchange}:${fyersSym}-${suffix}`)}&strikecount=30`;

    try {
      // 1. Attempt DIRECT call first
      try {
        console.log(`[OptionChain] Attempting direct fetch for ${cleanSym}...`);
        const res = await OptionChainService.fetchWithRetry(directUrl, {
          headers: {
            'Authorization': `${appId}:${token}`,
            'Accept': 'application/json'
          }
        });

        if (res.status === 401) {
          console.warn(`[OptionChain] 401 Unauthorized for ${cleanSym} on direct fetch. Clearing token.`);
          await FyersAuthService.clearToken();
        }

        if (res.ok) {
          let data = await res.json();

          const isOk = data.s === 'ok' || data.status === 'ok' || data.code === 200 || (data.data?.optionsChain && data.data.optionsChain.length > 0);

          if (isOk && data.data?.optionsChain && data.data.optionsChain.length > 0) {
            
            // --- ROLLOVER LOGIC: IF CURRENT EXPIRY IS TODAY, FETCH NEXT EXPIRY ---
            if (data.data.expiryData && data.data.expiryData.length > 1) {
              const currentExpiryObj = data.data.expiryData[0];
              const currentExpiryStr = typeof currentExpiryObj === 'string' ? currentExpiryObj : (currentExpiryObj.date || currentExpiryObj.expiryDate || currentExpiryObj.expiry);
              
              if (currentExpiryStr) {
                let isExpiredOrToday = false;
                let parsedExpiryDate: Date | null = null;
                const { getISTTime } = await import('@/lib/market-hours');
                const { dateString } = getISTTime();
                const [ty, tm, td] = dateString.split('-').map(Number);
                const todayISTMidnight = new Date(Date.UTC(ty, tm - 1, td));
                
                if (currentExpiryStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  const [ey, em, ed] = currentExpiryStr.split('-').map(Number);
                  parsedExpiryDate = new Date(Date.UTC(ey, em - 1, ed));
                } else if (currentExpiryStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
                  const [ed, em, ey] = currentExpiryStr.split('-').map(Number);
                  parsedExpiryDate = new Date(Date.UTC(ey, em - 1, ed));
                } else {
                  const d = new Date(currentExpiryStr);
                  if (!isNaN(d.getTime())) {
                    parsedExpiryDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                  }
                }
                
                if (parsedExpiryDate) {
                  const diffTime = parsedExpiryDate.getTime() - todayISTMidnight.getTime();
                  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                  isExpiredOrToday = diffDays <= 0;
                } else {
                  // Fallback string matching just in case
                  const optionsGB: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' };
                  const todayStr1 = new Date().toLocaleDateString('en-GB', optionsGB).replace(/ /g, '-');
                  isExpiredOrToday = currentExpiryStr.toLowerCase() === todayStr1.toLowerCase();
                }
                
                console.log(`[OptionChain] Rollover check for ${cleanSym} - currentExpiryStr: ${currentExpiryStr}, parsed: ${parsedExpiryDate}, today: ${todayISTMidnight}, isExpiredOrToday: ${isExpiredOrToday}`);
                
                if (allowRollover && isExpiredOrToday) {
                  const nextExpiryObj = data.data.expiryData[1];
                  const nextExpiryTimestamp = typeof nextExpiryObj === 'string' ? null : nextExpiryObj?.expiry;
                  const nextExpiryStr = typeof nextExpiryObj === 'string' ? nextExpiryObj : (nextExpiryObj?.date || nextExpiryObj?.expiryDate || nextExpiryObj?.expiry);
                  
                  if (nextExpiryTimestamp) {
                    console.log(`[OptionChain] Current expiry ${currentExpiryStr} is expired/today. Fetching NEXT expiry timestamp: ${nextExpiryTimestamp} (${nextExpiryStr}) for ${cleanSym}`);
                    const nextUrl = `${directUrl}&timestamp=${nextExpiryTimestamp}`;
                    const resNext = await OptionChainService.fetchWithRetry(nextUrl, {
                      headers: {
                        'Authorization': `${appId}:${token}`,
                        'Accept': 'application/json'
                      }
                    });
                    
                    if (resNext.ok) {
                      const dataNext = await resNext.json();
                      console.log(`[OptionChain] Next expiry response status: ${dataNext.s}, message: ${dataNext.message}`);
                      if ((dataNext.s === 'ok' || dataNext.status === 'ok' || dataNext.code === 200) && dataNext.data?.optionsChain) {
                         data = dataNext; // Use next expiry data
                         console.log(`[OptionChain] Successfully rolled over ${cleanSym} to ${nextExpiryStr}`);
                      } else {
                         console.warn(`[OptionChain] Rollover failed. Fyers error: ${JSON.stringify(dataNext)}`);
                      }
                    } else {
                      console.warn(`[OptionChain] Rollover HTTP failed with status ${resNext.status}`);
                    }
                  } else {
                    console.warn(`[OptionChain] Could not find next expiry string in expiryData:`, data.data.expiryData);
                  }
                }
              }
            }
            // ---------------------------------------------------------------------

            const result: OptionChainResult = {
              optionsChain: data.data.optionsChain.map((o: { symbol: string; strikePrice?: number; strike_price?: number; optionType?: 'CE' | 'PE'; option_type?: 'CE' | 'PE'; ltp: number; open_interest?: number; oi?: number; volume?: number; vol_traded_today?: number; bid?: number; ask?: number }) => ({
                symbol: o.symbol,
                strikePrice: o.strikePrice !== undefined ? o.strikePrice : (o.strike_price !== undefined ? o.strike_price : 0),
                optionType: o.optionType !== undefined ? o.optionType : (o.option_type !== undefined ? o.option_type : 'CE'),
                ltp: o.ltp,
                open_interest: o.open_interest || o.oi || 0,
                volume: o.volume || o.vol_traded_today || 0,
                bid: o.bid || 0,
                ask: o.ask || 0,
              })),
              expiryData: data.data.expiryData || [],
              method: 'direct'
            };
            console.log(`[OptionChain] Direct fetch succeeded for ${cleanSym}.`);
            await CacheService.set(cacheKey, result, 600);
            return result;
          }
        }
        console.warn(`[OptionChain] Direct call failed with status: ${res.status}`);
      } catch (directErr) {
        console.warn(`[OptionChain] Direct call failed for ${cleanSym}:`, directErr);
      }

      // 2. FALLBACK to Cloudflare proxy worker
      const proxyUrl = env.FYERS_AUTH_PROXY_URL;
      if (!proxyUrl) {
        console.warn(`[OptionChain] Direct call failed and FYERS_AUTH_PROXY_URL is not set. Aborting proxy fallback.`);
        return { error: 'PROXY_NOT_CONFIGURED' };
      }
      console.log(`[OptionChain] Attempting proxy fetch for ${cleanSym} via ${proxyUrl}...`);
      const proxySymbol = encodeURIComponent(`${exchange}:${fyersSym}-${suffix}`);
      const res = await fetch(`${proxyUrl.replace(/\/$/, '')}/data/options-chain-v3?symbol=${proxySymbol}&strikecount=30`, {
        headers: {
          'Authorization': `${appId}:${token}`,
          'X-Fyers-AppId': appId,
          'x-target-host': 'api-t1.fyers.in'
        }
      });

      if (res.status === 401) {
        console.warn(`[OptionChain] 401 Unauthorized for ${cleanSym} on proxy fetch. Clearing token.`);
        await FyersAuthService.clearToken();
      }

      if (res.ok) {
        const data = await res.json();

        const isOk = data.s === 'ok' || data.status === 'ok' || data.code === 200 || (data.data?.optionsChain && data.data.optionsChain.length > 0);
        if (isOk && data.data?.optionsChain && data.data.optionsChain.length > 0) {
          const result: OptionChainResult = {
            optionsChain: data.data.optionsChain.map((o: { symbol: string; strikePrice?: number; strike_price?: number; optionType?: 'CE' | 'PE'; option_type?: 'CE' | 'PE'; ltp: number; open_interest?: number; oi?: number; volume?: number; vol_traded_today?: number; bid?: number; ask?: number }) => ({
              symbol: o.symbol,
              strikePrice: o.strikePrice !== undefined ? o.strikePrice : (o.strike_price !== undefined ? o.strike_price : 0),
              optionType: o.optionType !== undefined ? o.optionType : (o.option_type !== undefined ? o.option_type : 'CE'),
              ltp: o.ltp,
              open_interest: o.open_interest || o.oi || 0,
              volume: o.volume || o.vol_traded_today || 0,
              bid: o.bid || 0,
              ask: o.ask || 0,
            })),
            expiryData: data.data.expiryData || [],
            method: 'proxy'
          };
          console.log(`[OptionChain] Proxy fetch succeeded for ${cleanSym}.`);
          await CacheService.set(cacheKey, result, 600);
          return result;
        }
      }

      // Both direct and proxy returned empty or non-ok — market closed / no data
      console.warn(`[OptionChain] Both direct and proxy returned no option chain data for ${cleanSym}. Returning EMPTY_CHAIN.`);
      return { error: 'EMPTY_CHAIN' };

    } catch (err) {
      console.error(`[OptionChainService] Unexpected error for ${cleanSym}:`, err);
      return { error: 'FETCH_EXCEPTION' };
    }
  }

  public static async fetchOptionQuote(optionSymbol: string): Promise<number> {
    const match = optionSymbol.match(/NSE:([A-Z0-9_\-&]+)\d{2}[A-Z]{3}/);
    if (!match) {
      throw new Error(`Invalid option symbol format: ${optionSymbol}`);
    }
    const cleanSym = match[1];
    const chainRes = await this.getOptionChain(cleanSym);
    if ('error' in chainRes) {
      throw new Error(`Failed to fetch option quote: ${chainRes.error}`);
    }
    const option = chainRes.optionsChain.find(o => o.symbol === optionSymbol);
    if (!option) {
      throw new Error(`Option symbol not found in option chain: ${optionSymbol}`);
    }
    return option.ltp;
  }

  private static async fetchWithRetry(url: string, options?: RequestInit, retries = 3, delay = 150): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options);
        if (res.status === 429) {
          console.warn(`[OptionChain] Hit 429 Rate Limit for ${url}. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
        return res;
      } catch (err) {
        if (i === retries - 1) throw err;
        console.warn(`[OptionChain] Fetch error for ${url}. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`, err);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
    return fetch(url, options);
  }
}
