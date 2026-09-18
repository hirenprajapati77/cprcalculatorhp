/**
 * Standalone Production Remediation Script: Correct STBT Underlying Cash Leg P&L for PNBHOUSING
 *
 * Target Record: cmu5chhmo063s7wkps6rjqccp (PNBHOUSING on 2026-09-16)
 * Before: entryCmp: 1106.3, exitCmp: 1121.9, pnl: +15.6, pnlPct: +1.41%
 * Expected: entryCmp: 1106.3, exitCmp: 1121.9, pnl: -15.6, pnlPct: -1.41%
 *
 * Usage:
 *   node remediate-pnbhousing-pnl.cjs            # Dry-run preview
 *   node remediate-pnbhousing-pnl.cjs --apply    # Transactional execution
 */

const fs = require('fs');
const path = require('path');

// Load environment variables if not present
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function computeJournalPnl(entryCmp, exitCmp, opts) {
  const isShort = Boolean(opts && opts.isShortUnderlying);
  const pnl = isShort ? entryCmp - exitCmp : exitCmp - entryCmp;
  const pnlPct = entryCmp > 0 ? (pnl / entryCmp) * 100 : 0;
  return {
    pnl: round2(pnl),
    pnlPct: round2(pnlPct),
  };
}

function isUnderlyingJournalLeg(optionContract) {
  return typeof optionContract === 'string' && optionContract.startsWith('UNDERLYING');
}

function isShortUnderlyingLeg(entry) {
  if (!entry.optionContract || typeof entry.optionContract !== 'string') return false;
  return isUnderlyingJournalLeg(entry.optionContract) && entry.signalType === 'STBT';
}

function classifyOutcome(trade) {
  if (!trade || trade.exitCmp === null || trade.entryCmp === null) return 'MODEL_VALID';

  let outcome = 'MODEL_VALID';
  const pnlPct = trade.pnlPct ?? 0;
  const gapRef = trade.cmp916 ?? trade.cmp930 ?? trade.cmp945 ?? trade.exitCmp;

  if (pnlPct < 0 && gapRef != null && trade.entryCmp) {
    const isUnderlying = isUnderlyingJournalLeg(trade.optionContract);
    const isShortUnderlying = isShortUnderlyingLeg(trade);
    const rawGapPct = ((gapRef - trade.entryCmp) / trade.entryCmp) * 100;
    const gapPct = isShortUnderlying ? -rawGapPct : rawGapPct;
    const threshold = isUnderlying ? -1.5 : -15;
    if (gapPct < threshold) {
      outcome = 'GAP_FAILURE';
    }
  }

  if (pnlPct < 0 && outcome !== 'GAP_FAILURE') {
    if (trade.qualityBucketAtSignal === 'LOW_QUALITY') {
      outcome = 'LOW_QUALITY_SHOULD_SKIP';
    } else if (trade.eventRiskScoreAtSignal && trade.eventRiskScoreAtSignal >= 50) {
      outcome = 'EVENT_RISK_AVOIDABLE';
    } else if (trade.qualityBucketAtSignal === 'WATCHLIST') {
      outcome = 'MODEL_WEAK';
    } else {
      outcome = 'EXECUTION_SLIPPAGE';
    }
  }

  return outcome;
}

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

  // Calculate direction-aware target values
  const isShortUnderlying = isShortUnderlyingLeg(current);
  if (!isShortUnderlying) {
    console.error('\n[ABORT] Record is not recognized as isShortUnderlyingLeg.');
    process.exit(1);
  }

  const { pnl: targetPnl, pnlPct: targetPnlPct } = computeJournalPnl(current.entryCmp, current.exitCmp, {
    isShortUnderlying: true,
  });

  const projectedOutcome = classifyOutcome({
    ...current,
    pnl: targetPnl,
    pnlPct: targetPnlPct,
  });

  console.log('\n[2] Target Remediation Values:');
  console.log({
    targetPnl,
    targetPnlPct,
    deltaPnl: `${current.pnl} -> ${targetPnl}`,
    deltaPnlPct: `${current.pnlPct}% -> ${targetPnlPct}%`,
    targetExecutionOutcome: projectedOutcome,
    deltaExecutionOutcome: `${current.executionOutcome ?? 'null'} -> ${projectedOutcome}`,
  });

  if (current.pnl === targetPnl && current.pnlPct === targetPnlPct) {
    console.log(`\n[INFO] P&L values are already remediated (pnl=${targetPnl}, pnlPct=${targetPnlPct}%).`);
    if (!isDryRun) {
      console.log('Ensuring execution classification outcome is up to date...');
      await prisma.tradeJournal.update({
        where: { id: TARGET_ID },
        data: { executionOutcome: projectedOutcome },
      });
      const updated = await prisma.tradeJournal.findUnique({ where: { id: TARGET_ID } });
      console.log('Verified Record:', {
        id: updated.id,
        symbol: updated.symbol,
        pnl: updated.pnl,
        pnlPct: updated.pnlPct,
        executionOutcome: updated.executionOutcome,
      });
    }
    console.log('\n[OK] Record is fully remediated.');
    process.exit(0);
  }

  // Verify exact match against expected un-remediated state
  const mismatches = [];
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

  if (isDryRun) {
    console.log('\n[DRY RUN COMPLETE] Pre-checks passed. No changes were written to the database.');
    console.log('To apply these changes, rerun with --apply:');
    console.log('  node remediate-pnbhousing-pnl.cjs --apply\n');
    process.exit(0);
  }

  // Transactional apply
  console.log('\n[3] Executing transactional update...');
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.tradeJournal.findUnique({
      where: { id: TARGET_ID },
    });

    if (!fresh || fresh.pnl !== EXPECTED_BEFORE.pnl || fresh.pnlPct !== EXPECTED_BEFORE.pnlPct) {
      throw new Error(`Concurrent modification detected. Expected pnl=${EXPECTED_BEFORE.pnl}, found pnl=${fresh ? fresh.pnl : 'null'}`);
    }

    await tx.tradeJournal.update({
      where: { id: TARGET_ID },
      data: {
        pnl: targetPnl,
        pnlPct: targetPnlPct,
        executionOutcome: projectedOutcome,
      },
    });
  });

  console.log('[OK] Transaction committed successfully.');

  const updated = await prisma.tradeJournal.findUnique({
    where: { id: TARGET_ID },
  });

  console.log('\n[4] Verified Final Record in Database:');
  console.log({
    id: updated.id,
    symbol: updated.symbol,
    pnl: updated.pnl,
    pnlPct: updated.pnlPct,
    executionOutcome: updated.executionOutcome,
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
