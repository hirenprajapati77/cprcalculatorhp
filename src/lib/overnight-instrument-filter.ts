/**
 * Prisma where-clause fragment that excludes INDEX rows from stock overnight
 * pipelines. Null instrumentType is treated as STOCK (legacy rows).
 */
export const STOCK_OVERNIGHT_INSTRUMENT_WHERE = {
  NOT: { instrumentType: 'INDEX' },
} as const;

/** Index-only overnight rows (NIFTY / BANKNIFTY BTST persisted from index-scan). */
export const INDEX_OVERNIGHT_INSTRUMENT_WHERE = {
  instrumentType: 'INDEX',
} as const;
