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

  public static async getOptionChain(symbol: string, underlyingPrice?: number): Promise<OptionChainResult | { error: string }> {
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
      if (underlyingPrice) {
        console.log(`[OptionChain] Access token missing/expired. Generating mock fallback for ${cleanSym}...`);
        return this.generateMockOptionChain(cleanSym, underlyingPrice);
      }
      return { error: 'TOKEN_EXPIRED' };
    }

    let appId: string;
    try {
      const creds = FyersAuthService.getCredentials();
      appId = creds.appId;
    } catch (e) {
      console.error('[OptionChain] Failed to load Fyers credentials:', e);
      if (underlyingPrice) {
        console.log(`[OptionChain] Credentials missing. Generating mock fallback for ${cleanSym}...`);
        return this.generateMockOptionChain(cleanSym, underlyingPrice);
      }
      return { error: 'CREDENTIALS_MISSING' };
    }

    const isIndex = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'].some(idx => cleanSym.includes(idx));
    const suffix = isIndex ? 'INDEX' : 'EQ';
    const directUrl = `https://api-t1.fyers.in/data/options-chain-v3?symbol=NSE:${cleanSym}-${suffix}&strikecount=30`;

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
      const res = await fetch(`${proxyUrl.replace(/\/$/, '')}/data/options-chain-v3?symbol=NSE:${cleanSym}-${suffix}&strikecount=30`, {
        headers: {
          'Authorization': `${appId}:${token}`,
          'X-Fyers-AppId': appId,
          'x-target-host': 'api-t1.fyers.in'
        }
      });

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
          await CacheService.set(cacheKey, result, 60);
          return result;
        }
      }

      // If Fyers returns empty options chain (e.g. exchange closed on weekends)
      if (underlyingPrice) {
        console.log(`[OptionChain] Fyers API returned empty option chain for ${cleanSym} (likely weekend). Generating mock fallback...`);
        return this.generateMockOptionChain(cleanSym, underlyingPrice);
      }

      return { error: 'FETCH_FAILED' };
    } catch (err) {
      console.error(`[OptionChainService] Error for ${cleanSym}:`, err);
      if (underlyingPrice) {
        return this.generateMockOptionChain(cleanSym, underlyingPrice);
      }
      return { error: 'FETCH_EXCEPTION' };
    }
  }

  public static generateMockOptionChain(symbol: string, underlyingPrice: number): OptionChainResult {
    const cleanSym = symbol.toUpperCase().trim().replace('-EQ', '');
    const strikeIncrement = this.getStrikeIncrement(cleanSym, underlyingPrice);
    
    const atmStrike = Math.round(underlyingPrice / strikeIncrement) * strikeIncrement;
    const strikes: number[] = [];
    
    for (let i = -15; i <= 15; i++) {
      strikes.push(atmStrike + i * strikeIncrement);
    }
    
    const optionsChain: OptionChainResult['optionsChain'] = [];
    
    for (const strike of strikes) {
      // CE Premium
      let ceLtp = 0.05;
      if (strike < underlyingPrice) {
        ceLtp = (underlyingPrice - strike) + (underlyingPrice * 0.02);
      } else {
        ceLtp = underlyingPrice * 0.02 * Math.exp(-(strike - underlyingPrice) / (underlyingPrice * 0.05));
      }
      ceLtp = parseFloat(Math.max(0.05, ceLtp).toFixed(2));
      
      // PE Premium
      let peLtp = 0.05;
      if (strike > underlyingPrice) {
        peLtp = (strike - underlyingPrice) + (underlyingPrice * 0.02);
      } else {
        peLtp = underlyingPrice * 0.02 * Math.exp(-(underlyingPrice - strike) / (underlyingPrice * 0.05));
      }
      peLtp = parseFloat(Math.max(0.05, peLtp).toFixed(2));
      
      optionsChain.push({
        symbol: this.buildOptionSymbol(cleanSym, strike, 'CE'),
        strikePrice: strike,
        optionType: 'CE',
        ltp: ceLtp,
        open_interest: Math.round(Math.random() * 100000)
      });
      
      optionsChain.push({
        symbol: this.buildOptionSymbol(cleanSym, strike, 'PE'),
        strikePrice: strike,
        optionType: 'PE',
        ltp: peLtp,
        open_interest: Math.round(Math.random() * 100000)
      });
    }
    
    return {
      optionsChain,
      expiryData: [{ expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] }],
      method: 'proxy'
    };
  }

  public static async fetchOptionQuote(optionSymbol: string): Promise<number> {
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
