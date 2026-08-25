/**
 * STANDING VERIFICATION RULE:
 * Verification/read queries against DailyOhlcv (or any production table) MUST NOT
 * be launched while a write operation (DELETE, INSERT, ingestion, backfill, migration)
 * is in progress against the same database/table.
 * Always wait for all writes to finish and commit before launching verification reads.
 */
import { PrismaClient } from '@prisma/client';

export async function printConnectionSanityHeader(prisma: PrismaClient): Promise<{
  host: string;
  database: string;
  distinctDates: number;
  totalRows: number;
  minDate: string;
  maxDate: string;
}> {
  const dbUrl = process.env.DATABASE_URL || 'unknown';
  let host = 'localhost';
  let database = 'unknown';

  try {
    const urlObj = new URL(dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://') ? dbUrl : `postgresql://${dbUrl}`);
    host = urlObj.hostname || 'localhost';
    database = urlObj.pathname.replace(/^\//, '') || 'unknown';
  } catch {
    // fallback
  }

  const [dateCountRes, rowCountRes, rangeRes] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(DISTINCT date)::bigint as count FROM "DailyOhlcv"`,
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint as count FROM "DailyOhlcv"`,
    prisma.$queryRaw<Array<{ minDate: string; maxDate: string }>>`SELECT MIN(date) as "minDate", MAX(date) as "maxDate" FROM "DailyOhlcv"`,
  ]);

  const distinctDates = Number(dateCountRes[0]?.count || 0);
  const totalRows = Number(rowCountRes[0]?.count || 0);
  const minDate = rangeRes[0]?.minDate || 'N/A';
  const maxDate = rangeRes[0]?.maxDate || 'N/A';

  console.log('=== CONNECTION SANITY CHECK ===');
  console.log(`Host: ${host}`);
  console.log(`Database: ${database}`);
  console.log(`Distinct dates in DailyOhlcv: ${distinctDates}`);
  console.log(`Total rows in DailyOhlcv: ${totalRows}`);
  console.log(`Date range: ${minDate} to ${maxDate}`);
  console.log('================================\n');

  return { host, database, distinctDates, totalRows, minDate, maxDate };
}
