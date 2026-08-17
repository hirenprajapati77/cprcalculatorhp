import { prisma } from '@/lib/db';
import { getISTDateString } from '@/lib/market-hours';

export type BreakoutAlertSuppressionRow = {
  symbol: string;
  reason: string;
  detail: string;
};

function cleanSymbol(symbol: string): string {
  return symbol.split(':')[0].trim().toUpperCase();
}

function symbolDateWhere(symbol: string, date: string) {
  const clean = cleanSymbol(symbol);
  return {
    date,
    OR: [{ symbol: clean }, { symbol: `${clean}:BSE` }],
  };
}

/** Write gate suppressions onto today's ScannerResult row(s) for UI visibility. */
export async function persistBreakoutAlertSuppressions(
  rows: BreakoutAlertSuppressionRow[],
  date = getISTDateString()
): Promise<void> {
  if (rows.length === 0) return;
  const at = new Date();
  await Promise.all(
    rows.map(({ symbol, reason, detail }) =>
      prisma.scannerResult.updateMany({
        where: symbolDateWhere(symbol, date),
        data: {
          alertSuppressedReason: reason,
          alertSuppressedDetail: detail,
          alertSuppressedAt: at,
        },
      })
    )
  );
}

/** Clear suppression after a successful Telegram send for actionable breakouts. */
export async function clearBreakoutAlertSuppressions(
  symbols: string[],
  date = getISTDateString()
): Promise<void> {
  if (symbols.length === 0) return;
  const unique = [...new Set(symbols.map(cleanSymbol))];
  await Promise.all(
    unique.map((clean) =>
      prisma.scannerResult.updateMany({
        where: {
          date,
          OR: [{ symbol: clean }, { symbol: `${clean}:BSE` }],
        },
        data: {
          alertSuppressedReason: null,
          alertSuppressedDetail: null,
          alertSuppressedAt: null,
        },
      })
    )
  );
}
