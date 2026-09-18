/**
 * Database Remediation Script: Correct STBT Underlying Cash Leg P&L for PNBHOUSING
 *
 * Target Record: cmu5chhmo063s7wkps6rjqccp (PNBHOUSING on 2026-09-16)
 * Before: entryCmp: 1106.3, exitCmp: 1121.9, pnl: +15.6, pnlPct: +1.41%
 * Expected: entryCmp: 1106.3, exitCmp: 1121.9, pnl: -15.6, pnlPct: -1.41%
 *
 * Usage:
 *   npx tsx scripts/remediate-pnbhousing-pnl.ts            # Dry-run preview
 *   npx tsx scripts/remediate-pnbhousing-pnl.ts --apply    # Transactional execution
 */

import { prisma } from '../src/lib/db';
import { TradeJournalService } from '../src/services/journal/trade-journal.service';
import { computeJournalPnl } from '../src/lib/pnl';

const TARGET_ID = 'cmu5chhmo063s7wkps6rjqccp';
const EXPECTED_BEFORE = {
  id: TARGET_ID,
  symbol: 'PNBHOUSING',
  signalType: 'STBT',
  optionContract: 'UNDERLYING PE',
  entryCmp: 1106.3,
  exitCmp: 1121.9,
  pnl: 15.6,
  pnlPct: 1.41,
};

async function main() {
  const isApply = process.argv.includes('--apply') || process.argv.includes('--execute');
  const isDryRun = !isApply || process.argv.includes('--dry-run');

  console.log('='.repeat(70));
  console.log(`PNBHOUSING STBT P&L Remediation Tool [Mode: ${isDryRun ? 'DRY-RUN PREVIEW' : 'TRANSACTIONAL APPLY'}]`);
  console.log('='.repeat(70));

  const current = await prisma.tradeJournal.findUnique({
    where: { id: TARGET_ID },
  });

  if (!current) {
    console.error(`[ABORT] Target record with id ${TARGET_ID} not found in database.`);
    process.exit(1);
  }

  console.log('\n[1] Current Record in Database:');
  console.log({
    id: current.id,
    symbol: current.symbol,
    signalType: current.signalType,
    optionContract: current.optionContract,
    entryCmp: current.entryCmp,
    exitCmp: current.exitCmp,
    pnl: current.pnl,
    pnlPct: current.pnlPct,
    executionOutcome: current.executionOutcome,
  });

  // Verify exact match against expected un-remediated state
  const mismatches: string[] = [];
  if (current.symbol !== EXPECTED_BEFORE.symbol) mismatches.push(`symbol: expected ${EXPECTED_BEFORE.symbol}, got ${current.symbol}`);
  if (current.signalType !== EXPECTED_BEFORE.signalType) mismatches.push(`signalType: expected ${EXPECTED_BEFORE.signalType}, got ${current.signalType}`);
  if (current.optionContract !== EXPECTED_BEFORE.optionContract) mismatches.push(`optionContract: expected ${EXPECTED_BEFORE.optionContract}, got ${current.optionContract}`);
  if (current.entryCmp !== EXPECTED_BEFORE.entryCmp) mismatches.push(`entryCmp: expected ${EXPECTED_BEFORE.entryCmp}, got ${current.entryCmp}`);
  if (current.exitCmp !== EXPECTED_BEFORE.exitCmp) mismatches.push(`exitCmp: expected ${EXPECTED_BEFORE.exitCmp}, got ${current.exitCmp}`);

  if (mismatches.length > 0) {
    console.error('\n[ABORT] Record state does not match expected criteria:');
    mismatches.forEach((m) => console.error(` - ${m}`));
    process.exit(1);
  }

  // Calculate direction-aware target values
  const isShortUnderlying = TradeJournalService.isShortUnderlyingLeg(current);
  if (!isShortUnderlying) {
    console.error('\n[ABORT] Record is not recognized as isShortUnderlyingLeg.');
    process.exit(1);
  }

  const { pnl: targetPnl, pnlPct: targetPnlPct } = computeJournalPnl(current.entryCmp, current.exitCmp!, {
    isShortUnderlying: true,
  });

  console.log('\n[2] Target Remediation Values:');
  console.log({
    targetPnl,
    targetPnlPct,
    deltaPnl: `${current.pnl} -> ${targetPnl}`,
    deltaPnlPct: `${current.pnlPct}% -> ${targetPnlPct}%`,
  });

  if (current.pnl === targetPnl && current.pnlPct === targetPnlPct) {
    console.log(`\n[INFO] P&L values are already remediated (pnl=${targetPnl}, pnlPct=${targetPnlPct}%).`);
    if (!isDryRun) {
      console.log('Ensuring execution classification outcome is up to date...');
      await TradeJournalService.classifyExecutionOutcome(TARGET_ID);
      const updated = await prisma.tradeJournal.findUnique({ where: { id: TARGET_ID } });
      console.log('Verified Record:', {
        id: updated?.id,
        symbol: updated?.symbol,
        pnl: updated?.pnl,
        pnlPct: updated?.pnlPct,
        executionOutcome: updated?.executionOutcome,
      });
    }
    console.log('\n[OK] Record is fully remediated.');
    process.exit(0);
  }

  if (isDryRun) {
    console.log('\n[DRY RUN COMPLETE] No changes were made to the database.');
    console.log('To apply these changes, rerun with --apply:');
    console.log('  npx tsx scripts/remediate-pnbhousing-pnl.ts --apply\n');
    process.exit(0);
  }

  // Transactional apply
  console.log('\n[3] Executing transactional update...');
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.tradeJournal.findUnique({
      where: { id: TARGET_ID },
    });

    if (!fresh || fresh.pnl !== EXPECTED_BEFORE.pnl || fresh.pnlPct !== EXPECTED_BEFORE.pnlPct) {
      throw new Error(`Concurrent modification detected. Expected pnl=${EXPECTED_BEFORE.pnl}, found pnl=${fresh?.pnl}`);
    }

    await tx.tradeJournal.update({
      where: { id: TARGET_ID },
      data: {
        pnl: targetPnl,
        pnlPct: targetPnlPct,
      },
    });
  });

  console.log('[OK] Transaction committed successfully.');

  // Recalculate execution classification (safely retryable)
  console.log('\n[4] Recalculating execution classification outcome...');
  try {
    await TradeJournalService.classifyExecutionOutcome(TARGET_ID);
  } catch (classErr) {
    console.warn('[WARNING] Failed to recalculate execution classification:', classErr);
    console.warn('The P&L update is committed safely. You can safely re-run this script to retry classification.');
  }

  const updated = await prisma.tradeJournal.findUnique({
    where: { id: TARGET_ID },
  });

  console.log('\n[5] Verified Final Record:');
  console.log({
    id: updated?.id,
    symbol: updated?.symbol,
    pnl: updated?.pnl,
    pnlPct: updated?.pnlPct,
    executionOutcome: updated?.executionOutcome,
  });
  console.log('\n[SUCCESS] PNBHOUSING remediation completed successfully.\n');
}

main()
  .catch((err) => {
    console.error('\n[FATAL ERROR]', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
