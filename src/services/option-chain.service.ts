import { env } from '@/config/env';
import { FyersAuthService } from './fyers-auth.service';
import { CacheService } from './cache.service';
import { isMarketOpen } from '@/lib/market-hours';

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

type FyersOptionChainOption = {
  symbol: string;
  strikePrice?: number;
  strike_price?: number;
  optionType?: 'CE' | 'PE';
  option_type?: 'CE' | 'PE';
  ltp: number;
  open_interest?: number;
  oi?: number;
  volume?: number;
  vol_traded_today?: number;
  bid?: number;
  ask?: number;
};

type FyersExpiryEntry = string | {
  date?: string;
  expiryDate?: string;
  expiry?: string | number;
};

type ValidOptionChainResponse = {
  s?: string;
  status?: string;
  code?: number;
  message?: string;
  data: {
    optionsChain: FyersOptionChainOption[];
    expiryData?: FyersExpiryEntry[];
  };
};

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


  public static async getOptionChain(symbol: string, allowRollover: boolean = true, targetExpiryStr?: string): Promise<OptionChainResult | { error: string }> {
    const cleanSym = symbol.toUpperCase().trim().replace('-EQ', '');
    const cacheKey = targetExpiryStr 
      ? `option_chain_${cleanSym}_${targetExpiryStr}`
      : (allowRollover ? `option_chain_${cleanSym}_rollover` : `option_chain_${cleanSym}_current`);

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

          const isOk = OptionChainService.isValidOptionChainResponse(data);

          if (isOk) {
            data = await OptionChainService.resolveRolledOverChain(data, {
              allowRollover,
              targetExpiryStr,
              cleanSym,
              requestUrl: directUrl,
              fetchFn: (url) => OptionChainService.fetchWithRetry(url, {
                headers: {
                  'Authorization': `${appId}:${token}`,
                  'Accept': 'application/json'
                }
              })
            });

            const result: OptionChainResult = {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              optionsChain: data.data.optionsChain.map((o: any) => ({
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
            const ttl = isMarketOpen() ? 60 : 600;
            await CacheService.set(cacheKey, result, ttl);
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
        let data = await res.json();

        const isOk = OptionChainService.isValidOptionChainResponse(data);
        if (isOk) {
          const proxyBaseUrl = `${proxyUrl.replace(/\/$/, '')}/data/options-chain-v3?symbol=${proxySymbol}&strikecount=30`;
          data = await OptionChainService.resolveRolledOverChain(data, {
            allowRollover,
            targetExpiryStr,
            cleanSym,
            requestUrl: proxyBaseUrl,
            fetchFn: (url) => fetch(url, {
              headers: {
                'Authorization': `${appId}:${token}`,
                'X-Fyers-AppId': appId,
                'x-target-host': 'api-t1.fyers.in'
              }
            })
          });

          const result: OptionChainResult = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            optionsChain: data.data.optionsChain.map((o: any) => ({
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
          const ttl = isMarketOpen() ? 60 : 600;
          await CacheService.set(cacheKey, result, ttl);
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

  private static isValidOptionChainResponse(data: unknown): data is ValidOptionChainResponse {
    if (!data || typeof data !== 'object') return false;
    const response = data as { s?: unknown; status?: unknown; code?: unknown; data?: { optionsChain?: unknown } };
    const statusOk = response.s === 'ok' || response.status === 'ok' || response.code === 200;
    const hasOptions = Array.isArray(response.data?.optionsChain) && response.data.optionsChain.length > 0;
    return Boolean(statusOk && hasOptions);
  }

  private static async resolveRolledOverChain(
    data: ValidOptionChainResponse,
    params: {
      allowRollover: boolean;
      targetExpiryStr?: string | undefined;
      cleanSym: string;
      requestUrl: string;
      fetchFn: (url: string) => Promise<Response>;
    }
  ): Promise<ValidOptionChainResponse> {
    const expiryData = data.data.expiryData;
    if (!expiryData || expiryData.length === 0) {
      return data;
    }

    if (params.targetExpiryStr) {
      const parsedTarget = OptionChainService.parseExpiryDate(params.targetExpiryStr);
      
      const targetMatch = expiryData.find(e => {
        const val = OptionChainService.getExpiryValue(e);
        if (!val) return false;
        const parsedVal = OptionChainService.parseExpiryDate(val);
        if (!parsedTarget || !parsedVal) return false;

        // "JUL 2026" (monthly) -> match year and month
        const hasDayComponent = /^\d{1,2}\s/.test(params.targetExpiryStr!);
        
        if (hasDayComponent) {
          return parsedVal.getTime() === parsedTarget.getTime();
        } else {
          return parsedVal.getFullYear() === parsedTarget.getFullYear() && 
                 parsedVal.getMonth() === parsedTarget.getMonth();
        }
      });

      if (targetMatch) {
        const targetTimestamp = typeof targetMatch === 'string' ? null : (targetMatch as { expiry?: string }).expiry;
        if (targetTimestamp) {
          console.log(`[OptionChain] Fetching explicit target expiry: ${params.targetExpiryStr} -> ${targetTimestamp} for ${params.cleanSym}`);
          const resTarget = await params.fetchFn(`${params.requestUrl}&timestamp=${targetTimestamp}`);
          if (resTarget.ok) {
            const dataTarget = await resTarget.json();
            if (OptionChainService.isValidOptionChainResponse(dataTarget)) {
              return dataTarget;
            }
          }
        }
      }
    }

    if (!params.allowRollover || expiryData.length <= 1) {
      return data;
    }

    const currentExpiryStr = OptionChainService.getExpiryValue(expiryData[0]);
    if (!currentExpiryStr) {
      return data;
    }

    const { isExpiredOrToday, parsedExpiryDate, todayISTMidnight } =
      await OptionChainService.isExpiryExpiredOrToday(currentExpiryStr);

    console.log(`[OptionChain] Rollover check for ${params.cleanSym} - currentExpiryStr: ${currentExpiryStr}, parsed: ${parsedExpiryDate}, today: ${todayISTMidnight}, isExpiredOrToday: ${isExpiredOrToday}`);

    if (!isExpiredOrToday) {
      return data;
    }

    const nextExpiryObj = expiryData[1];
    const nextExpiryTimestamp = typeof nextExpiryObj === 'string' ? null : nextExpiryObj?.expiry;
    const nextExpiryStr = OptionChainService.getExpiryValue(nextExpiryObj);

    if (!nextExpiryTimestamp) {
      console.warn(`[OptionChain] Could not find next expiry string in expiryData:`, expiryData);
      return data;
    }

    console.log(`[OptionChain] Current expiry ${currentExpiryStr} is expired/today. Fetching NEXT expiry timestamp: ${nextExpiryTimestamp} (${nextExpiryStr}) for ${params.cleanSym}`);
    const resNext = await params.fetchFn(`${params.requestUrl}&timestamp=${nextExpiryTimestamp}`);

    if (!resNext.ok) {
      console.warn(`[OptionChain] Rollover HTTP failed with status ${resNext.status}`);
      return data;
    }

    const dataNext = await resNext.json();
    console.log(`[OptionChain] Next expiry response status: ${dataNext.s}, message: ${dataNext.message}`);
    if (OptionChainService.isValidOptionChainResponse(dataNext)) {
      console.log(`[OptionChain] Successfully rolled over ${params.cleanSym} to ${nextExpiryStr}`);
      return dataNext;
    }

    console.warn(`[OptionChain] Rollover failed. Fyers error: ${JSON.stringify(dataNext)}`);
    return data;
  }

  private static getExpiryValue(expiry: FyersExpiryEntry | undefined): string | null {
    if (!expiry) return null;
    const value = typeof expiry === 'string' ? expiry : (expiry.date || expiry.expiryDate || expiry.expiry);
    return value === undefined || value === null ? null : String(value);
  }

  private static parseExpiryDate(expiryStr: string): Date | null {
    if (expiryStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [ey, em, ed] = expiryStr.split('-').map(Number);
      return new Date(Date.UTC(ey, em - 1, ed));
    } else if (expiryStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
      const [ed, em, ey] = expiryStr.split('-').map(Number);
      return new Date(Date.UTC(ey, em - 1, ed));
    } else {
      const d = new Date(expiryStr);
      if (!isNaN(d.getTime())) {
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      }
    }
    return null;
  }

  private static async isExpiryExpiredOrToday(expiryStr: string): Promise<{
    isExpiredOrToday: boolean;
    parsedExpiryDate: Date | null;
    todayISTMidnight: Date;
  }> {
    let parsedExpiryDate: Date | null = OptionChainService.parseExpiryDate(expiryStr);
    const { getISTTime } = await import('@/lib/market-hours');
    const { dateString } = getISTTime();
    const [ty, tm, td] = dateString.split('-').map(Number);
    const todayISTMidnight = new Date(Date.UTC(ty, tm - 1, td));

    if (parsedExpiryDate) {
      const diffTime = parsedExpiryDate.getTime() - todayISTMidnight.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      return { isExpiredOrToday: diffDays <= 0, parsedExpiryDate, todayISTMidnight };
    }

    const optionsGB: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' };
    const todayStr1 = new Date().toLocaleDateString('en-GB', optionsGB).replace(/ /g, '-');
    return {
      isExpiredOrToday: expiryStr.toLowerCase() === todayStr1.toLowerCase(),
      parsedExpiryDate,
      todayISTMidnight
    };
  }
}
