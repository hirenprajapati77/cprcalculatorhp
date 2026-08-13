/**
 * Fyers Quotes API helpers — multi-symbol batching (max 50 per request).
 * Used by LiveFeed to cut per-symbol quote HTTP during scanner/overnight runs.
 */

export const FYERS_QUOTES_MAX_PER_REQUEST = 50;

export interface FyersQuoteFields {
  lp: number;
  open_price?: number | undefined;
  high_price?: number | undefined;
  low_price?: number | undefined;
  prev_close_price?: number | undefined;
  atp?: number | undefined;
  volume?: number | undefined;
}

export type FyersQuotesApiRow = {
  n?: string;
  s?: string;
  v?: {
    lp?: number;
    open_price?: number;
    high_price?: number;
    low_price?: number;
    prev_close_price?: number;
    atp?: number;
    volume?: number;
  };
};

export type FyersQuotesApiResponse = {
  s?: string;
  code?: number;
  message?: string;
  d?: FyersQuotesApiRow[];
};

export function toFyersEquitySymbol(cleanSymbol: string, market: 'NSE' | 'BSE' = 'NSE'): string {
  const sym = cleanSymbol.trim().toUpperCase();
  return market === 'NSE' ? `NSE:${sym}-EQ` : `BSE:${sym}-EQ`;
}

/** Strip `NSE:RELIANCE-EQ` / `BSE:FOO-EQ` → `RELIANCE` / `FOO`. */
export function fromFyersEquitySymbol(fyersSymbol: string): string | null {
  const m = /^[A-Z]+:([A-Z0-9&.-]+)-EQ$/i.exec(fyersSymbol.trim());
  return m ? m[1]!.toUpperCase() : null;
}

export function chunkSymbols<T>(items: T[], chunkSize: number): T[][] {
  const size = Math.max(1, Math.min(FYERS_QUOTES_MAX_PER_REQUEST, Math.floor(chunkSize) || FYERS_QUOTES_MAX_PER_REQUEST));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function isPositivePrice(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Parse a Fyers quotes JSON body into cleanSymbol → quote fields.
 * Invalid / errored rows are skipped (partial success is OK for batch scans).
 */
export function parseFyersQuotesResponse(
  json: FyersQuotesApiResponse,
  expectedMarket: 'NSE' | 'BSE' = 'NSE'
): Map<string, FyersQuoteFields> {
  const out = new Map<string, FyersQuoteFields>();
  if (json.s !== 'ok' || !Array.isArray(json.d)) return out;

  for (const row of json.d) {
    if (!row || row.s !== 'ok' || !row.v || !isPositivePrice(row.v.lp)) continue;
    const fromN = row.n ? fromFyersEquitySymbol(row.n) : null;
    const clean = fromN ?? null;
    if (!clean) continue;
    // Ignore cross-market rows if the API ever mixes them
    if (row.n && expectedMarket === 'NSE' && !row.n.toUpperCase().startsWith('NSE:')) continue;
    if (row.n && expectedMarket === 'BSE' && !row.n.toUpperCase().startsWith('BSE:')) continue;

    const v = row.v;
    out.set(clean, {
      lp: v.lp!,
      open_price: isPositivePrice(v.open_price) ? v.open_price : undefined,
      high_price: isPositivePrice(v.high_price) ? v.high_price : undefined,
      low_price: isPositivePrice(v.low_price) ? v.low_price : undefined,
      prev_close_price: isPositivePrice(v.prev_close_price) ? v.prev_close_price : undefined,
      atp: isPositivePrice(v.atp) ? v.atp : undefined,
      volume:
        typeof v.volume === 'number' && Number.isFinite(v.volume) && v.volume >= 0
          ? v.volume
          : undefined,
    });
  }
  return out;
}

export function buildFyersQuotesUrl(fyersSymbols: string[]): string {
  return (
    `https://api-t1.fyers.in/data/quotes?` +
    new URLSearchParams({ symbols: fyersSymbols.join(',') }).toString()
  );
}
