export interface MarketStockData {
  symbol: string;
  market: 'NSE' | 'BSE';
  sector: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  avgVolume: number;
  marketCap: number; // INR Crores
  ltp: number;
}

// 30 High-weight Indian stocks mapped with sector
const STOCK_UNIVERSE: { symbol: string; name: string; sector: string; isNifty50: boolean; isNifty200: boolean }[] = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy', isNifty50: true, isNifty200: true },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT', isNifty50: true, isNifty200: true },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Financial Services', isNifty50: true, isNifty200: true },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT', isNifty50: true, isNifty200: true },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Financial Services', isNifty50: true, isNifty200: true },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', isNifty50: true, isNifty200: true },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Financial Services', isNifty50: true, isNifty200: true },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Construction', isNifty50: true, isNifty200: true },
  { symbol: 'ITC', name: 'ITC Limited', sector: 'Consumer Goods', isNifty50: true, isNifty200: true },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'Consumer Goods', isNifty50: true, isNifty200: true },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Financial Services', isNifty50: true, isNifty200: true },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Financial Services', isNifty50: true, isNifty200: true },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Automotive', isNifty50: true, isNifty200: true },
  { symbol: 'M&M', name: 'Mahindra & Mahindra', sector: 'Automotive', isNifty50: true, isNifty200: true },
  { symbol: 'NTPC', name: 'NTPC Limited', sector: 'Power', isNifty50: true, isNifty200: true },
  { symbol: 'POWERGRID', name: 'Power Grid Corporation', sector: 'Power', isNifty50: true, isNifty200: true },
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical', sector: 'Healthcare', isNifty50: true, isNifty200: true },
  { symbol: 'TITAN', name: 'Titan Company', sector: 'Consumer Goods', isNifty50: true, isNifty200: true },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement', sector: 'Materials', isNifty50: true, isNifty200: true },
  { symbol: 'COALINDIA', name: 'Coal India', sector: 'Energy', isNifty50: true, isNifty200: true },
  { symbol: 'JSWSTEEL', name: 'JSW Steel', sector: 'Metals', isNifty50: true, isNifty200: true },
  { symbol: 'ADANIPORTS', name: 'Adani Ports & SEZ', sector: 'Services', isNifty50: true, isNifty200: true },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Financial Services', isNifty50: true, isNifty200: true },
  { symbol: 'WIPRO', name: 'Wipro Limited', sector: 'IT', isNifty50: false, isNifty200: true },
  { symbol: 'TECHM', name: 'Tech Mahindra', sector: 'IT', isNifty50: false, isNifty200: true },
  { symbol: 'HCLTECH', name: 'HCL Technologies', sector: 'IT', isNifty50: false, isNifty200: true },
  { symbol: 'ONGC', name: 'Oil & Natural Gas Corp', sector: 'Energy', isNifty50: false, isNifty200: true },
  { symbol: 'BPCL', name: 'Bharat Petroleum', sector: 'Energy', isNifty50: false, isNifty200: true },
  { symbol: 'TATASTEEL', name: 'Tata Steel', sector: 'Metals', isNifty50: false, isNifty200: true },
  { symbol: 'HINDALCO', name: 'Hindalco Industries', sector: 'Metals', isNifty50: false, isNifty200: true },
];

const MARKET_CAPS: Record<string, number> = {
  RELIANCE: 1680000,
  TCS: 1250000,
  HDFCBANK: 920000,
  INFY: 620000,
  ICICIBANK: 670000,
  BHARTIARTL: 450000,
  SBIN: 510000,
  LT: 390000,
  ITC: 480000,
  HINDUNILVR: 590000,
  KOTAKBANK: 350000,
  AXISBANK: 310000,
  TATAMOTORS: 280000,
  'M&M': 190000,
  NTPC: 220000,
  POWERGRID: 210000,
  SUNPHARMA: 250000,
  TITAN: 270000,
  ULTRACEMCO: 290000,
  COALINDIA: 180000,
  JSWSTEEL: 175000,
  ADANIPORTS: 160000,
  BAJFINANCE: 410000,
  WIPRO: 230000,
  TECHM: 110000,
  HCLTECH: 340000,
  ONGC: 260000,
  BPCL: 95000,
  TATASTEEL: 150000,
  HINDALCO: 115000,
};

export class MarketService {
  /**
   * Fetches active stock universe metadata based on parameters.
   */
  static getUniverse(universe: 'NIFTY50' | 'NIFTY200' | 'ALL') {
    if (universe === 'NIFTY50') {
      return STOCK_UNIVERSE.filter(s => s.isNifty50);
    }
    if (universe === 'NIFTY200') {
      return STOCK_UNIVERSE.filter(s => s.isNifty200);
    }
    return STOCK_UNIVERSE;
  }

  /**
   * Fetches daily OHLC, Volume, and LTP for a given stock symbol.
   * Leverages MARKET_DATA_MODE env variable for mock, paper or live Yahoo Finance feeds.
   */
  static async getStockData(symbol: string, market: 'NSE' | 'BSE' = 'NSE'): Promise<MarketStockData | null> {
    const dataMode = process.env.MARKET_DATA_MODE || 'live';
    const ticker = market === 'NSE' ? `${symbol}.NS` : `${symbol}.BO`;
    const staticMeta = STOCK_UNIVERSE.find(s => s.symbol === symbol) || { sector: 'Other' };
    const marketCap = MARKET_CAPS[symbol] || 50000;

    // --- LIVE MODE: Real-time Yahoo Finance Chart Scraper ---
    if (dataMode === 'live') {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`,
          {
            next: { revalidate: 60 }, // Cache on server for 1 minute
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          }
        );

        if (!res.ok) {
          throw new Error(`Yahoo Finance responded with status ${res.status}`);
        }

        const json = await res.json();
        const result = json?.chart?.result?.[0];

        if (result) {
          const meta = result.meta;
          const quote = result.indicators?.quote?.[0];

          if (quote && quote.high && quote.high.length > 0) {
            // Get the latest complete day's OHLC
            const len = quote.high.length;
            
            // Loop backwards to find a valid non-null daily candle
            let idx = len - 1;
            while (idx >= 0 && (quote.high[idx] === null || quote.low[idx] === null || quote.close[idx] === null)) {
              idx--;
            }

            if (idx >= 0) {
              const prevHigh = quote.high[idx];
              const prevLow = quote.low[idx];
              const prevClose = quote.close[idx];
              const prevOpen = quote.open[idx] || prevClose;
              const prevVolume = quote.volume[idx] || 100000;

              // Calculate average volume over the last 5 days
              const validVolumes = quote.volume.filter((v: number | null) => v !== null) as number[];
              const avgVolume = validVolumes.length > 0
                ? validVolumes.reduce((a, b) => a + b, 0) / validVolumes.length
                : prevVolume;

              // Last Traded Price (LTP) is the current regular market price
              const ltp = meta.regularMarketPrice || prevClose;

              return {
                symbol,
                market,
                sector: staticMeta.sector,
                open: prevOpen,
                high: prevHigh,
                low: prevLow,
                close: prevClose,
                volume: prevVolume,
                avgVolume,
                marketCap,
                ltp,
              };
            }
          }
        }
      } catch (err) {
        console.warn(`Live Yahoo feed failed for ${ticker}, falling back to paper data:`, err);
      }
    }

    // --- PAPER & MOCK FALLBACK MODE: Deterministic Price Generation ---
    // Deterministic random generator based on symbol name to keep values consistent but realistic
    const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const basePrice = (seed % 15) * 200 + 150; // Base stock price between 150 and 3150
    
    // Simulate daily price movement
    const dateSeed = new Date().getDate();
    const pctChange = ((seed + dateSeed) % 10 - 5) / 100; // -5% to +5% change
    
    const close = basePrice * (1 + pctChange);
    const open = close * (1 - (pctChange * 0.2));
    const high = Math.max(open, close) * 1.015;
    const low = Math.min(open, close) * 0.985;
    
    // Average volume simulation (1M to 10M)
    const avgVolume = (seed % 9 + 1) * 1000000;
    
    // LTP fluctuates randomly around close in paper mode
    let ltp = close;
    let volume = avgVolume;
    
    if (dataMode === 'paper') {
      const timeSeed = Math.floor(Date.now() / (5 * 60 * 1000)); // updates every 5 mins
      const intradayFluct = ((seed + timeSeed) % 8 - 4) / 400; // -1% to +1% fluctuation
      ltp = close * (1 + intradayFluct);
      volume = avgVolume * (0.8 + ((seed + timeSeed) % 5) / 10); // Volume flits between 80% to 120% of avg
    }

    return {
      symbol,
      market,
      sector: staticMeta.sector,
      open,
      high,
      low,
      close,
      volume,
      avgVolume,
      marketCap,
      ltp,
    };
  }
}
