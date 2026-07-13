/**
 * One-off backfill for TradeJournal rows orphaned by the weekend/holiday snapshot bug
 * (see AGENT_BRIEFING_journal-weekend-orphan.md). Not wired into any API route or cron —
 * run manually, locally or via SSH on the Oracle box, with direct DB access.
 *
 * Usage:
 *   npx tsx scripts/backfill-orphaned-journal-snapshots.ts                 # dry run, auto-detect
 *   npx tsx scripts/backfill-orphaned-journal-snapshots.ts --confirm       # actually backfill all
 *   npx tsx scripts/backfill-orphaned-journal-snapshots.ts --date=2026-07-10 --confirm
 *                                                                          # scope to one date
 *
 * BEFORE RUNNING: confirm the exact signature TradeJournalService.captureSnapshot() ended up
 * with in your patch — this script assumes `captureSnapshot(slot, forDate?: Date)`. If your
 * implementation named the param differently or put it in a different position, update the
 * call below to match.
 */

import { prisma } from '../src/lib/db';
import { TradeJournalService } from '../src/services/journal/trade-journal.service';

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const dateArg = args.find(a => a.startsWith('--date='));
const explicitDate = dateArg ? dateArg.split('=')[1] : null; // YYYY-MM-DD, IST calendar date

function istDateStringToMidnightUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const midnightUTC = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  midnightUTC.setUTCMinutes(midnightUTC.getUTCMinutes() - 330);
  return midnightUTC;
}

async function findOrphanedDates(): Promise<Date[]> {
  const rows = await prisma.tradeJournal.findMany({
    where: { cmp916: null },
    select: { tradeDate: true },
    distinct: ['tradeDate'],
  });
  return rows.map(r => r.tradeDate);
}

async function run() {
  const targetDates: Date[] = explicitDate
    ? [istDateStringToMidnightUTC(explicitDate)]
    : await findOrphanedDates();

  if (targetDates.length === 0) {
    console.log('No orphaned rows found (cmp916 IS NULL AND entryCmp IS NOT NULL). Nothing to do.');
    process.exit(0);
  }

  console.log(`Found ${targetDates.length} orphaned tradeDate(s):`);
  for (const d of targetDates) console.log('  -', d.toISOString().split('T')[0]);

  if (!CONFIRM) {
    console.log('\nDRY RUN — no changes made. Re-run with --confirm to actually backfill.');
    console.log('Optionally scope to a single date with --date=YYYY-MM-DD.');
    process.exit(0);
  }

  for (const forDate of targetDates) {
    const dateLabel = forDate.toISOString().split('T')[0];
    console.log(`\n=== Backfilling ${dateLabel} ===`);

    // Report which rows already have a manual exit BEFORE the 1000 slot can touch them.
    // captureSnapshot's existing `!entry.exitCmp` guard should already prevent overwriting
    // a real manual exit, but printing this list gives you a chance to visually confirm
    // nothing unexpected is about to be auto-closed.
    const preExisting = await prisma.tradeJournal.findMany({
      where: { tradeDate: forDate, cmp916: null },
      select: { id: true, symbol: true, optionContract: true, exitCmp: true },
    });
    const alreadyExited = preExisting.filter(r => r.exitCmp !== null);
    if (alreadyExited.length > 0) {
      console.log(
        `  ${alreadyExited.length} row(s) already have a manual exitCmp — the 1000 slot ` +
        `will NOT overwrite these (guarded by the existing !entry.exitCmp check):`
      );
      alreadyExited.forEach(r => console.log(`    - ${r.symbol} ${r.optionContract}`));
    }

    // Order matters: 1000 auto-closes any row still missing exitCmp, so it must run last.
    for (const slot of ['916', '930', '945', '1000'] as const) {
      console.log(`  -> ${slot} snapshot...`);
      try {
        await TradeJournalService.captureSnapshot(slot, forDate);
      } catch (err) {
        console.error(`  !! ${slot} snapshot failed for ${dateLabel}:`, err);
        // Continue to next slot rather than aborting the whole run — a single bad
        // option-chain fetch (e.g. contract already expired past a weekly expiry)
        // shouldn't block the other slots or other dates.
      }
    }
  }

  console.log('\nBackfill complete. Re-run the orphan-check query from the briefing to confirm:');
  console.log(`  SELECT symbol, "tradeDate", "cmp916", "cmp930", "cmp945", "cmp1000", "exitCmp"`);
  console.log(`  FROM "TradeJournal" WHERE "cmp916" IS NULL AND "entryCmp" IS NOT NULL;`);
  process.exit(0);
}

run().catch(err => {
  console.error('Backfill script failed:', err);
  process.exit(1);
});
