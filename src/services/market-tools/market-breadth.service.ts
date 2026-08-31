import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { NSE_SECTOR_MAP } from './nse-sector-map';

export interface SectorBreadth {
  sector: string;
  rank: number;
  totalStocks: number;
  advances: number;
  declines: number;
  avgChangePct: number;
  status: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface UniverseBreadth {
  universe: 'ALL_NSE' | 'NIFTY_50' | 'NSE_FNO';
  totalCount: number;
  advances: number;
  declines: number;
  unchanged: number;
  adRatio: number;
  aboveMa10Count: number;
  ma10EligibleCount: number;
  aboveMa10Pct: number;
  aboveMa20Count: number;
  ma20EligibleCount: number;
  aboveMa20Pct: number;
  aboveMa50Count: number;
  ma50EligibleCount: number;
  aboveMa50Pct: number;
  aboveMa200Count: number;
  ma200EligibleCount: number;
  aboveMa200Pct: number;
  up4PctCount: number;
  down4PctCount: number;
  new52wHighCount: number;
  new52wLowCount: number;
  netNewHighs: number;
  status52w: '+VE' | '-VE' | 'NEUTRAL';
}

export interface MarketBreadthReport {
  date: string;
  tradingDaysAvailable: number;
  overallScore: number; // 0 - 100
  marketRegime: 'EXTREME_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'EXTREME_BEARISH';
  allNse: UniverseBreadth;
  nifty50: UniverseBreadth;
  nseFno: UniverseBreadth;
  sectors: {
    allNse: SectorBreadth[];
    nifty50: SectorBreadth[];
    nseFno: SectorBreadth[];
  };
  computedAt: string;
  /**
   * 'pending' when Redis cache is cold and no report has been computed yet.
   * Optional for backward compatibility with reports cached before this
   * field existed -- absence should be treated as 'ready' by consumers.
   */
  status?: 'ready' | 'pending';
}

let cachedReport: MarketBreadthReport | null = null;
let lastComputedTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class MarketBreadthService {
  /**
   * Compute comprehensive market breadth metrics across DailyOhlcv history.
   */
  static async getMarketBreadth(forceRefresh = false): Promise<MarketBreadthReport> {
    const now = Date.now();
    if (!forceRefresh && cachedReport && now - lastComputedTime < CACHE_TTL_MS) {
      return cachedReport;
    }

    if (!forceRefresh) {
      try {
        const redisCached = await cache.get('market_breadth:report');
        if (redisCached) {
          const parsed = JSON.parse(redisCached) as MarketBreadthReport;
          cachedReport = parsed;
          lastComputedTime = now;
          return parsed;
        }
      } catch {
        // Ignore cache lookup errors
      }

      // Memory fallback if Redis is temporarily unreachable
      if (cachedReport) {
        return cachedReport;
      }

      // If cache is missing and forceRefresh=false, do NOT trigger heavy live compute on HTTP thread.
      // Return empty baseline report until background precompute job runs.
      // Use 'N/A' for date — today's wall-clock date is wrong after midnight
      // before the 19:15 precompute runs and would mislead consumers.
      return {
        date: 'N/A',
        tradingDaysAvailable: 0,
        nifty50: { universe: 'NIFTY_50', totalCount: 0, advances: 0, declines: 0, unchanged: 0, adRatio: 0, aboveMa10Count: 0, ma10EligibleCount: 0, aboveMa10Pct: 0, aboveMa20Count: 0, ma20EligibleCount: 0, aboveMa20Pct: 0, aboveMa50Count: 0, ma50EligibleCount: 0, aboveMa50Pct: 0, aboveMa200Count: 0, ma200EligibleCount: 0, aboveMa200Pct: 0, up4PctCount: 0, down4PctCount: 0, new52wHighCount: 0, new52wLowCount: 0, netNewHighs: 0, status52w: 'NEUTRAL' },
        nseFno: { universe: 'NSE_FNO', totalCount: 0, advances: 0, declines: 0, unchanged: 0, adRatio: 0, aboveMa10Count: 0, ma10EligibleCount: 0, aboveMa10Pct: 0, aboveMa20Count: 0, ma20EligibleCount: 0, aboveMa20Pct: 0, aboveMa50Count: 0, ma50EligibleCount: 0, aboveMa50Pct: 0, aboveMa200Count: 0, ma200EligibleCount: 0, aboveMa200Pct: 0, up4PctCount: 0, down4PctCount: 0, new52wHighCount: 0, new52wLowCount: 0, netNewHighs: 0, status52w: 'NEUTRAL' },
        allNse: { universe: 'ALL_NSE', totalCount: 0, advances: 0, declines: 0, unchanged: 0, adRatio: 0, aboveMa10Count: 0, ma10EligibleCount: 0, aboveMa10Pct: 0, aboveMa20Count: 0, ma20EligibleCount: 0, aboveMa20Pct: 0, aboveMa50Count: 0, ma50EligibleCount: 0, aboveMa50Pct: 0, aboveMa200Count: 0, ma200EligibleCount: 0, aboveMa200Pct: 0, up4PctCount: 0, down4PctCount: 0, new52wHighCount: 0, new52wLowCount: 0, netNewHighs: 0, status52w: 'NEUTRAL' },
        overallScore: 5,
        marketRegime: 'NEUTRAL',
        sectors: { allNse: [], nifty50: [], nseFno: [] },
        computedAt: new Date().toISOString(),
        status: 'pending',
      };
    }

    // 1. Fetch available trading dates sorted descending
    const dateRows = await prisma.$queryRaw<Array<{ date: string }>>`
      SELECT DISTINCT date FROM "DailyOhlcv" WHERE series = 'EQ' ORDER BY date DESC LIMIT 250
    `;

    if (dateRows.length === 0) {
      throw new Error('No data available in DailyOhlcv table');
    }

    const latestDate = dateRows[0]!.date;
    const tradingDaysAvailable = dateRows.length;

    // 2. Fetch today's records with historical MA calculations
    // SQL query computes 10, 20, 50, 200 SMA and 52W High/Low per symbol
    const rawStockStats = await prisma.$queryRaw<
      Array<{
        symbol: string;
        close: number;
        prevClose: number;
        changePct: number;
        historyDays: bigint | number;
        ma10: number | null;
        ma20: number | null;
        ma50: number | null;
        ma200: number | null;
        high52w: number | null;
        low52w: number | null;
      }>
    >`
      WITH RankedHistory AS (
        SELECT 
          symbol,
          series,
          date,
          close,
          "prevClose",
          ((close - "prevClose") / NULLIF("prevClose", 0)) * 100 as "changePct",
          COUNT(*) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as "historyDays",
          AVG(close) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) as ma10,
          AVG(close) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) as ma20,
          AVG(close) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 49 PRECEDING AND CURRENT ROW) as ma50,
          AVG(close) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 199 PRECEDING AND CURRENT ROW) as ma200,
          MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) as high52w,
          MIN(low) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 249 PRECEDING AND CURRENT ROW) as low52w,
          ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) as rn
        FROM "DailyOhlcv"
        WHERE series = 'EQ'
      )
      SELECT 
        symbol,
        series,
        close,
        "prevClose",
        "changePct",
        "historyDays",
        ma10,
        ma20,
        ma50,
        ma200,
        high52w,
        low52w
      FROM RankedHistory
      WHERE date = ${latestDate} AND rn = 1
    `;

    // B1 fix: Prisma $queryRaw returns Postgres NUMERIC columns as Prisma.Decimal
    // objects, not primitive JS numbers. Coerce every numeric field immediately
    // after the query so all downstream comparisons (>, >=, !== null) are correct.
    const stockStats = rawStockStats.map((s) => ({
      ...s,
      close: Number(s.close),
      prevClose: Number(s.prevClose),
      changePct: Number(s.changePct),
      historyDays: Number(s.historyDays ?? 0),
      ma10: s.ma10 !== null ? Number(s.ma10) : null,
      ma20: s.ma20 !== null ? Number(s.ma20) : null,
      ma50: s.ma50 !== null ? Number(s.ma50) : null,
      ma200: s.ma200 !== null ? Number(s.ma200) : null,
      high52w: s.high52w !== null ? Number(s.high52w) : null,
      low52w: s.low52w !== null ? Number(s.low52w) : null,
    }));

    // 3. Compute Universe Metrics (ALL NSE, NIFTY 50, NSE FNO)
    const allNse = computeUniverseBreadth('ALL_NSE', stockStats);

    // Mock/Filter Nifty 50 and FNO symbol subsets if present
    const nifty50Stats = stockStats.filter((s) => NIFTY50_SYMBOLS.has(s.symbol));
    const nifty50 = computeUniverseBreadth(
      'NIFTY_50',
      nifty50Stats.length > 0 ? nifty50Stats : stockStats.slice(0, 50)
    );

    const fnoStats = stockStats.filter((s) => FNO_SYMBOLS.has(s.symbol));
    const nseFno = computeUniverseBreadth(
      'NSE_FNO',
      fnoStats.length > 0 ? fnoStats : stockStats.slice(0, 180)
    );

    // 4. Compute Sector Rankings — once per universe, so switching universe
    // tabs on the frontend actually changes the sector breakdown. Previously
    // computed once against the full unfiltered stockStats and reused across
    // all three tabs (verified live: totals summed to the ALL_NSE count of
    // 2632 even while the Nifty 50 / F&O tabs were selected).
    const sectors = {
      allNse: computeSectorBreadth(stockStats),
      nifty50: computeSectorBreadth(nifty50Stats.length > 0 ? nifty50Stats : stockStats.slice(0, 50)),
      nseFno: computeSectorBreadth(fnoStats.length > 0 ? fnoStats : stockStats.slice(0, 180)),
    };

    // 5. Compute Overall Signed Signal-Agreement Score & Regime (matching reference tool -10 to +10 scale)
    const signals = [
      allNse.aboveMa20Pct >= 50 ? 1 : -1,
      allNse.aboveMa50Pct >= 50 ? 1 : -1,
      allNse.aboveMa200Pct >= 50 ? 1 : -1,
      allNse.adRatio >= 1.0 ? 1 : -1,
      allNse.up4PctCount > allNse.down4PctCount ? 1 : allNse.up4PctCount < allNse.down4PctCount ? -1 : 0,
      allNse.netNewHighs > 0 ? 1 : allNse.netNewHighs < 0 ? -1 : 0,
      nifty50.aboveMa50Pct >= 50 ? 1 : -1,
      nifty50.adRatio >= 1.0 ? 1 : -1,
      nseFno.aboveMa50Pct >= 50 ? 1 : -1,
      nseFno.adRatio >= 1.0 ? 1 : -1,
    ];

    const overallScore = signals.reduce((sum, sig) => sum + sig, 0);

    let marketRegime: MarketBreadthReport['marketRegime'] = 'NEUTRAL';
    if (overallScore >= 7) marketRegime = 'EXTREME_BULLISH';
    else if (overallScore >= 3) marketRegime = 'BULLISH';
    else if (overallScore >= -2) marketRegime = 'NEUTRAL';
    else if (overallScore >= -6) marketRegime = 'BEARISH';
    else marketRegime = 'EXTREME_BEARISH';

    const report: MarketBreadthReport = {
      date: latestDate,
      tradingDaysAvailable,
      overallScore,
      marketRegime,
      allNse,
      nifty50,
      nseFno,
      sectors,
      computedAt: new Date().toISOString(),
      status: 'ready',
    };

    cachedReport = report;
    lastComputedTime = now;

    try {
      await cache.set('market_breadth:report', JSON.stringify(report), 3600);
    } catch {
      // Ignore cache write errors
    }

    return report;
  }
}

function computeUniverseBreadth(
  universe: UniverseBreadth['universe'],
  stats: Array<{
    symbol: string;
    close: number;
    prevClose: number;
    changePct: number;
    historyDays?: bigint | number;
    ma10: number | null;
    ma20: number | null;
    ma50: number | null;
    ma200: number | null;
    high52w: number | null;
    low52w: number | null;
  }>
): UniverseBreadth {
  const total = stats.length;
  if (total === 0) {
    return {
      universe,
      totalCount: 0,
      advances: 0,
      declines: 0,
      unchanged: 0,
      adRatio: 0,
      aboveMa10Count: 0,
      ma10EligibleCount: 0,
      aboveMa10Pct: 0,
      aboveMa20Count: 0,
      ma20EligibleCount: 0,
      aboveMa20Pct: 0,
      aboveMa50Count: 0,
      ma50EligibleCount: 0,
      aboveMa50Pct: 0,
      aboveMa200Count: 0,
      ma200EligibleCount: 0,
      aboveMa200Pct: 0,
      up4PctCount: 0,
      down4PctCount: 0,
      new52wHighCount: 0,
      new52wLowCount: 0,
      netNewHighs: 0,
      status52w: 'NEUTRAL',
    };
  }

  let advances = 0;
  let declines = 0;
  let unchanged = 0;

  let aboveMa10Count = 0;
  let ma10EligibleCount = 0;
  let aboveMa20Count = 0;
  let ma20EligibleCount = 0;
  let aboveMa50Count = 0;
  let ma50EligibleCount = 0;
  let aboveMa200Count = 0;
  let ma200EligibleCount = 0;

  let up4PctCount = 0;
  let down4PctCount = 0;
  let new52wHighCount = 0;
  let new52wLowCount = 0;

  for (const s of stats) {
    if (s.changePct > 0.05) advances++;
    else if (s.changePct < -0.05) declines++;
    else unchanged++;

    const historyDays = Number(s.historyDays || 0);

    if (historyDays >= 10) {
      ma10EligibleCount++;
      if (s.ma10 !== null && s.close >= s.ma10) aboveMa10Count++;
    }
    if (historyDays >= 20) {
      ma20EligibleCount++;
      if (s.ma20 !== null && s.close >= s.ma20) aboveMa20Count++;
    }
    if (historyDays >= 50) {
      ma50EligibleCount++;
      if (s.ma50 !== null && s.close >= s.ma50) aboveMa50Count++;
    }
    if (historyDays >= 200) {
      ma200EligibleCount++;
      if (s.ma200 !== null && s.close >= s.ma200) aboveMa200Count++;
    }

    if (s.changePct >= 4.0) up4PctCount++;
    if (s.changePct <= -4.0) down4PctCount++;

    if (s.high52w !== null && s.close >= s.high52w) new52wHighCount++;
    if (s.low52w !== null && s.close <= s.low52w) new52wLowCount++;
  }

  const adRatio = declines > 0 ? Math.round((advances / declines) * 100) / 100 : advances;
  const netNewHighs = new52wHighCount - new52wLowCount;
  const status52w: UniverseBreadth['status52w'] =
    netNewHighs > 0 ? '+VE' : netNewHighs < 0 ? '-VE' : 'NEUTRAL';

  return {
    universe,
    totalCount: total,
    advances,
    declines,
    unchanged,
    adRatio,
    aboveMa10Count,
    ma10EligibleCount,
    aboveMa10Pct: ma10EligibleCount > 0 ? Math.round((aboveMa10Count / ma10EligibleCount) * 1000) / 10 : 0,
    aboveMa20Count,
    ma20EligibleCount,
    aboveMa20Pct: ma20EligibleCount > 0 ? Math.round((aboveMa20Count / ma20EligibleCount) * 1000) / 10 : 0,
    aboveMa50Count,
    ma50EligibleCount,
    aboveMa50Pct: ma50EligibleCount > 0 ? Math.round((aboveMa50Count / ma50EligibleCount) * 1000) / 10 : 0,
    aboveMa200Count,
    ma200EligibleCount,
    aboveMa200Pct: ma200EligibleCount > 0 ? Math.round((aboveMa200Count / ma200EligibleCount) * 1000) / 10 : 0,
    up4PctCount,
    down4PctCount,
    new52wHighCount,
    new52wLowCount,
    netNewHighs,
    status52w,
  };
}

export function computeSectorBreadth(
  stats: Array<{ symbol: string; changePct: number }>
): SectorBreadth[] {
  const sectorMap = new Map<string, { total: number; adv: number; dec: number; sumChange: number }>();

  for (const s of stats) {
    const sector = getSymbolSector(s.symbol);
    if (!sectorMap.has(sector)) {
      sectorMap.set(sector, { total: 0, adv: 0, dec: 0, sumChange: 0 });
    }
    const data = sectorMap.get(sector)!;
    data.total++;
    if (s.changePct > 0) data.adv++;
    else if (s.changePct < 0) data.dec++;
    data.sumChange += s.changePct;
  }

  const result: SectorBreadth[] = [];
  for (const [sector, data] of sectorMap.entries()) {
    const avgChangePct = Math.round((data.sumChange / data.total) * 100) / 100;
    const status: SectorBreadth['status'] =
      avgChangePct > 0.3 ? 'BULLISH' : avgChangePct < -0.3 ? 'BEARISH' : 'NEUTRAL';

    result.push({
      sector,
      rank: 0,
      totalStocks: data.total,
      advances: data.adv,
      declines: data.dec,
      avgChangePct,
      status,
    });
  }

  // Sort by avgChangePct descending and assign rank
  result.sort((a, b) => b.avgChangePct - a.avgChangePct);
  result.forEach((sec, idx) => {
    sec.rank = idx + 1;
  });

  return result;
}

const BANKING_SYMBOLS = new Set([
  'HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK', 'BANDHANBNK',
  'BANKBARODA', 'CANBK', 'FEDERALBNK', 'IDFCFIRSTB', 'PNB', 'RBLBANK', 'AUBANK', 'BANKINDIA'
]);

const IT_SYMBOLS = new Set([
  'TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'LTIM', 'MPHASIS', 'COFORGE', 'PERSISTENT', 'OFSS', 'BSOFT'
]);

const AUTO_SYMBOLS = new Set([
  'TATAMOTORS', 'MARUTI', 'M&M', 'BAJAJ-AUTO', 'EICHERMOT', 'HEROMOTOCO', 'TVSMOTOR', 'ASHOKLEY', 'BHARATFORG', 'BOSCHLTD', 'ESCORTS'
]);

const PHARMA_SYMBOLS = new Set([
  'SUNPHARMA', 'DRREDDY', 'CIPLA', 'LUPIN', 'DIVISLAB', 'APOLLOHOSP', 'BIOCON', 'GLENMARK', 'GRANULES', 'IPCALAB', 'LAURUSLABS', 'METROPOLIS', 'TORNTPHARM', 'SYNGENE', 'ALKEM', 'ABBOTINDIA'
]);

const METALS_SYMBOLS = new Set([
  'TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'SAIL', 'JINDALSTEL', 'NATIONALUM', 'NMDC', 'VEDL', 'HINDCOPPER'
]);

const ENERGY_SYMBOLS = new Set([
  'RELIANCE', 'ONGC', 'BPCL', 'IOC', 'GAIL', 'HINDPETRO', 'NTPC', 'POWERGRID', 'TATAPOWER', 'PETRONET', 'COALINDIA', 'IGL', 'MGL', 'GUJGASLTD'
]);

const REALTY_SYMBOLS = new Set([
  'DLF', 'LODHA', 'GODREJPROP', 'OBEROIRLTY'
]);

const INFRA_SYMBOLS = new Set([
  'LT', 'SIEMENS', 'ABB', 'ACC', 'AMBUJACEMENT', 'DALBHARAT', 'GRASIM', 'JKCEMENT', 'POLYCAB', 'RAMCOCEM', 'ULTRACEMCO', 'CUMMINSIND', 'HAVELLS', 'INDUSTOWER'
]);

export function getSymbolSector(symbol: string): string {
  const base = symbol.split('-')[0]!;
  if (NSE_SECTOR_MAP[base]) return NSE_SECTOR_MAP[base];
  if (BANKING_SYMBOLS.has(base)) return 'BANKING';
  if (IT_SYMBOLS.has(base)) return 'IT';
  if (AUTO_SYMBOLS.has(base)) return 'AUTO';
  if (PHARMA_SYMBOLS.has(base)) return 'PHARMA';
  if (METALS_SYMBOLS.has(base)) return 'METALS';
  if (ENERGY_SYMBOLS.has(base)) return 'ENERGY';
  if (REALTY_SYMBOLS.has(base)) return 'REALTY';
  if (INFRA_SYMBOLS.has(base)) return 'INFRA';
  return 'OTHERS';
}

const NIFTY50_SYMBOLS = new Set([
  'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'BHARTIARTL', 'ITC', 'SBIN', 'LTIM', 'LICI',
  'HINDUNILVR', 'LT', 'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA', 'ADANIENT', 'KOTAKBANK', 'TATAMOTORS', 'AXISBANK',
  'TITAN', 'ULTRACEMCO', 'NTPC', 'ONGC', 'ASIANPAINT', 'POWERGRID', 'M&M', 'BAJAJFINSV', 'TATASTEEL', 'JSWSTEEL',
  'ADANIPORTS', 'COALINDIA', 'SIEMENS', 'DRREDDY', 'GRASIM', 'TECHM', 'BRITANNIA', 'CIPLA', 'INDUSINDBK', 'HDFCLIFE',
  'DIVISLAB', 'EICHERMOT', 'SBILIFE', 'BPCL', 'TATACONSUM', 'HEROMOTOCO', 'APOLLOHOSP', 'BAJAJ-AUTO', 'WIPRO', 'NESTLEIND'
]);

const FNO_SYMBOLS = new Set([
  'AARTIIND', 'ABB', 'ABBOTINDIA', 'ABCAPITAL', 'ABFRL', 'ACC', 'ADANIENT', 'ADANIPORTS', 'ALKEM', 'AMBUJACEMENT',
  'APOLLOHOSP', 'APOLLOTYRE', 'ASHOKLEY', 'ASIANPAINT', 'ASTRAL', 'ATUL', 'AUROPHARMA', 'AXISBANK', 'BAJAJ-AUTO', 'BAJAJFINSV',
  'BAJFINANCE', 'BALKRISIND', 'BALRAMCHIN', 'BANDHANBNK', 'BANKBARODA', 'BATAINDIA', 'BEL', 'BERGEPAINT', 'BHARATFORG', 'BHARTIARTL',
  'BHEL', 'BIOCON', 'BOSCHLTD', 'BPCL', 'BRITANNIA', 'BSOFT', 'CANBK', 'CANFINHOME', 'CHAMBLFERT', 'CHOLAFIN',
  'CIPLA', 'COALINDIA', 'COFORGE', 'COLPAL', 'CONCOR', 'COROMANDEL', 'CROMPTON', 'CUB', 'CUMMINSIND', 'DABUR',
  'DALBHARAT', 'DEEPAKNTR', 'DIVISLAB', 'DIXON', 'DLF', 'DRREDDY', 'EICHERMOT', 'ESCORTS', 'EXIDEIND', 'FEDERALBNK',
  'GAIL', 'GLENMARK', 'GMRINFRA', 'GNFC', 'GODREJPROP', 'GRANULES', 'GRASIM', 'GUJGASLTD', 'HAL', 'HAVELLS',
  'HCLTECH', 'HDFCBANK', 'HDFCLIFE', 'HEROMOTOCO', 'HINDALCO', 'HINDCOPPER', 'HINDPETRO', 'HINDUNILVR', 'ICICIBANK', 'ICICIGI',
  'ICICIPRULI', 'IDEA', 'IDFCFIRSTB', 'IEX', 'IGL', 'INDHOTEL', 'INDIACEM', 'INDIAMART', 'INDIGO', 'INDUSINDBK',
  'INDUSTOWER', 'INFY', 'IOC', 'IPCALAB', 'IRCTC', 'ITC', 'JINDALSTEL', 'JKCEMENT', 'JSWSTEEL', 'JUBLFOOD',
  'KALYANKJIL', 'KEI', 'KOTAKBANK', 'LALPATHLAB', 'LAURUSLABS', 'LICHSGFIN', 'LTIM', 'LT', 'LUPIN', 'M&M',
  'MANAPPURAM', 'MARICO', 'MARUTI', 'MCX', 'METROPOLIS', 'MFSL', 'MGL', 'MOTHERSON', 'MPHASIS', 'MRF',
  'MUTHOOTFIN', 'NATIONALUM', 'NAVINFLUOR', 'NESTLEIND', 'NMDC', 'NTPC', 'OBEROIRLTY', 'OFSS', 'ONGC', 'PAGEIND',
  'PERSISTENT', 'PETRONET', 'PFC', 'PIDILITIND', 'PIIND', 'PNB', 'POLYCAB', 'POWERGRID', 'PVRINOX', 'RAMCOCEM',
  'RBLBANK', 'RECLTD', 'RELIANCE', 'SAIL', 'SBICARD', 'SBILIFE', 'SBIN', 'SHREECEM', 'SHRIRAMFIN', 'SIEMENS',
  'SRF', 'SUNPHARMA', 'SUNTV', 'SYNGENE', 'TATACHEMICALS', 'TATACONSUM', 'TATAMOTORS', 'TATAPOWER', 'TATASTEEL', 'TCS',
  'TECHM', 'TITAN', 'TORNTPHARM', 'TRENT', 'TVSMOTOR', 'UBL', 'ULTRACEMCO', 'UPL', 'VEDL', 'VOLTAS', 'WIPRO', 'ZEEL'
]);
