import { FyersAuthService } from './fyers-auth.service';
import { CacheService } from './cache.service';

export interface OptionChainResult {
  optionsChain: Array<{
    symbol: string;
    strikePrice: number;
    optionType: 'CE' | 'PE';
    ltp: number;
    open_interest?: number;
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

  public static buildOptionSymbol(underlying: string, strike: number, type: 'CE' | 'PE'): string {
    const cleanUnderlying = underlying.toUpperCase().trim().replace('-EQ', '');
    const now = new Date();
    const year2Digit = now.getFullYear().toString().slice(-2);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month3Letter = months[now.getMonth()];
    
    return `NSE:${cleanUnderlying}${year2Digit}${month3Letter}${strike}${type}`;
  }

  public static async getOptionChain(symbol: string): Promise<OptionChainResult | { error: string }> {
    const cleanSym = symbol.toUpperCase().trim().replace('-EQ', '');
    const cacheKey = `option_chain_${cleanSym}`;
    
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

    const directUrl = `https://api.fyers.in/v3/data/options-chain?symbol=NSE:${cleanSym}-EQ&strikecount=30&timestamp=`;

    try {
      // 1. Attempt DIRECT call first
      try {
        console.log(`[OptionChain] Attempting direct fetch for ${cleanSym}...`);
        const res = await fetch(directUrl, {
          headers: {
            'Authorization': `${appId}:${token}`,
            'Accept': 'application/json'
          }
        });

        if (res.ok) {
          const data = await res.json();
          if (data.s === 'ok' && data.data?.optionsChain) {
            const result: OptionChainResult = {
              optionsChain: data.data.optionsChain.map((o: any) => ({
                symbol: o.symbol,
                strikePrice: o.strikePrice,
                optionType: o.optionType,
                ltp: o.ltp,
                open_interest: o.open_interest || o.oi || 0
              })),
              expiryData: data.data.expiryData || [],
              method: 'direct'
            };
            console.log(`[OptionChain] Direct fetch succeeded for ${cleanSym}.`);
            await CacheService.set(cacheKey, result, 60);
            return result;
          }
        }
        console.warn(`[OptionChain] Direct call failed with status: ${res.status}`);
      } catch (directErr) {
        console.warn(`[OptionChain] Direct call failed for ${cleanSym}:`, directErr);
      }

      // 2. FALLBACK to Cloudflare proxy worker
      const proxyUrl = process.env.FYERS_AUTH_PROXY_URL || 'https://cold-dew-46bf.prahiren.workers.dev';
      console.log(`[OptionChain] Attempting proxy fetch for ${cleanSym} via ${proxyUrl}...`);
      const res = await fetch(`${proxyUrl.replace(/\/$/, '')}/data/options-chain?symbol=NSE:${cleanSym}-EQ&strikecount=30`, {
        headers: {
          'Authorization': `${appId}:${token}`,
          'X-Fyers-AppId': appId,
          'x-target-host': 'api.fyers.in'
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.s === 'ok' && data.data?.optionsChain) {
          const result: OptionChainResult = {
            optionsChain: data.data.optionsChain.map((o: any) => ({
              symbol: o.symbol,
              strikePrice: o.strikePrice,
              optionType: o.optionType,
              ltp: o.ltp,
              open_interest: o.open_interest || o.oi || 0
            })),
            expiryData: data.data.expiryData || [],
            method: 'proxy'
          };
          console.log(`[OptionChain] Proxy fetch succeeded for ${cleanSym}.`);
          await CacheService.set(cacheKey, result, 60);
          return result;
        }
      }

      return { error: 'FETCH_FAILED' };
    } catch (err) {
      console.error(`[OptionChainService] Error for ${cleanSym}:`, err);
      return { error: 'FETCH_EXCEPTION' };
    }
  }

  public static async fetchOptionQuote(optionSymbol: string, stockLtp: number, strike: number, type: 'CE' | 'PE'): Promise<number> {
    const match = optionSymbol.match(/NSE:([A-Z0-9_\-]+)\d{2}[A-Z]{3}/);
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
}
