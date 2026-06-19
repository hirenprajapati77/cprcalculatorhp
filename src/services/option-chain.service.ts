import { FyersAuthService } from './fyers-auth.service';

export interface OptionContract {
  symbol: string;
  strike: number;
  type: 'CE' | 'PE';
  ltp: number;
  description: string;
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
    
    // Format: NSE:SBIN26JUN850CE
    return `NSE:${cleanUnderlying}${year2Digit}${month3Letter}${strike}${type}`;
  }

  public static async fetchOptionQuote(optionSymbol: string, stockLtp: number, strike: number, type: 'CE' | 'PE'): Promise<number> {
    const token = FyersAuthService.getAccessToken();
    const { appId, authProxyUrl } = FyersAuthService.getCredentials();

    if (token) {
      try {
        const proxyUrl = authProxyUrl || 'https://cold-dew-46bf.prahiren.workers.dev';
        const url = `${proxyUrl}/data/quotes?symbols=${encodeURIComponent(optionSymbol)}`;
        
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `${appId}:${token}`,
            'Accept': 'application/json',
            'X-Fyers-AppId': appId,
            'x-target-host': 'api-t1.fyers.in'
          }
        });

        if (res.ok) {
          const data = await res.json();
          if (data.s === 'ok' && data.d && data.d[0] && data.d[0].v) {
            const ltp = data.d[0].v.lp; // lp is Last Price in Fyers Quote structure
            if (typeof ltp === 'number' && ltp > 0) {
              return ltp;
            }
          }
        }
      } catch (err) {
        console.warn(`[OptionChainService] Failed to fetch live option quote for ${optionSymbol}:`, err);
      }
    }

    // Fallback: Simulate Option Price (Intrinsic Value + basic time value buffer)
    const intrinsicValue = type === 'CE' 
      ? Math.max(0, stockLtp - strike) 
      : Math.max(0, strike - stockLtp);
    
    // Add a time value estimation (e.g. 0.8% of stock price for ATM)
    const atmDistanceRatio = Math.abs(stockLtp - strike) / stockLtp;
    const timeValue = Math.max(1.0, stockLtp * 0.008 * Math.max(0, 1 - atmDistanceRatio * 5));
    
    return parseFloat((intrinsicValue + timeValue).toFixed(2));
  }
}
