import fs from 'fs';
import path from 'path';
import { ScannerService } from '../src/services/scanner.service';
import { calculateCPR } from '../src/lib/cpr-engine';
import { performance } from 'perf_hooks';
import crypto from 'crypto';
import * as Constants from '../src/config/trading-constants';

const BASELINE_PATH = path.resolve(__dirname, '../baseline_snapshot.json');
const MOCK_DATA_PATH = path.resolve(__dirname, '../mock_data.json');

async function runRegressionLock() {
  console.log('🔒 Starting Regression Lock Verification...');

  // 1. CONSTANTS LOCK
  const constantsString = JSON.stringify(Constants);
  const constantsHash = crypto.createHash('sha256').update(constantsString).digest('hex');
  const EXPECTED_HASH = '8d0ecc727a99da11a2802b9db4360a3cb1d08eb918eaffda7637041352d48a2a'; 
  
  if (constantsHash !== EXPECTED_HASH) {
     console.error(`❌ Constants Regression! Trading constants have mutated.\nExpected: ${EXPECTED_HASH}\nGot: ${constantsHash}`);
     process.exit(1);
  }
  console.log(`✅ Constants Hash Verified: ${constantsHash}`);
  
  // 2. PERFORMANCE BENCHMARK (CORE MATH)
  const perfStart = performance.now();
  for (let i = 0; i < 5000; i++) {
    calculateCPR(100 + i, 110 + i, 90 + i, 105 + i);
  }
  const perfEnd = performance.now();
  const perfDuration = perfEnd - perfStart;
  console.log(`⏱️ Math Core Benchmark (5000x calculateCPR): ${perfDuration.toFixed(2)}ms`);
  
  const MAX_ALLOWED_DURATION_MS = 50; // Threshold for 5000 iterations of simple math
  if (perfDuration > MAX_ALLOWED_DURATION_MS) {
     console.error(`❌ Performance Regression! Math core took ${perfDuration.toFixed(2)}ms (Limit: ${MAX_ALLOWED_DURATION_MS}ms)`);
     process.exit(1);
  }

  if (!fs.existsSync(BASELINE_PATH) || !fs.existsSync(MOCK_DATA_PATH)) {
    console.error('❌ Missing baseline_snapshot.json or mock_data.json');
    process.exit(1);
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const mockData = JSON.parse(fs.readFileSync(MOCK_DATA_PATH, 'utf8'));

  const symbols = Object.keys(baseline);
  let failed = false;

  for (const sym of symbols) {
    if (!mockData[sym]) continue;

    // Use a fixed asOfDate to match what generated the baseline (usually the last day in the mocked history)
    const lastDate = mockData[sym].history[mockData[sym].history.length - 1].date;
    const current = await ScannerService.scanStock(mockData[sym], lastDate);
    const legacy = baseline[sym];

    // Ensure we are testing the non-experimental mode
    if (process.env.ENABLE_EXPERIMENTAL_CPR_QUALITY === 'true') {
        console.warn('⚠️ ENABLE_EXPERIMENTAL_CPR_QUALITY is true. Regression test might fail or compare experimental fields.');
    }

    const legacyScore = legacy.score;
    const currentScore = current.score;
    const legacyEntry = Number(legacy.entry).toFixed(2);
    const currentEntry = Number(current.entry).toFixed(2);
    const legacyTarget = Number(legacy.target).toFixed(2);
    const currentTarget = Number(current.target).toFixed(2);
    const legacyWidth = Number(legacy.width).toFixed(4);
    const currentWidth = Number(current.width).toFixed(4);
    const legacyClass = legacy.classification;
    const currentClass = current.classification;
    const legacyRR = Number(legacy.rr || 0).toFixed(2);
    const currentRR = Number(current.rr || 0).toFixed(2);
    const legacyTrend = legacy.trend || '';
    const currentTrend = current.trend || '';
    const legacySignals = legacy.signals.join(',');
    // The new signals array might contain experimental tags, so we filter them out for a stable comparison if needed, or just compare raw.
    // Since experimental is off by default, raw comparison is fine.
    const currentSignals = current.signals.join(',');

    // Relationship parsing
    const relLegacy = legacy.signals.find((s: string) => s.includes('VALUE')) || 'NONE';
    const relNewRaw = current.signals.find((s: string) => s.includes('VALUE') || s.startsWith('CPR_REL_')) || 'NONE';
    const relNew = relNewRaw.replace('CPR_REL_', '');

    const isMatch = 
      legacyScore === currentScore &&
      legacyEntry === currentEntry &&
      legacyTarget === currentTarget &&
      legacyWidth === currentWidth &&
      legacyClass === currentClass &&
      legacyRR === currentRR &&
      legacyTrend === currentTrend &&
      legacySignals === currentSignals &&
      relLegacy === relNew;

    if (!isMatch) {
      failed = true;
      console.error(`❌ Mismatch detected for ${sym}!`);
      console.error(`   Score: ${legacyScore} vs ${currentScore}`);
      console.error(`   Entry: ${legacyEntry} vs ${currentEntry}`);
      console.error(`   Target: ${legacyTarget} vs ${currentTarget}`);
      console.error(`   Width: ${legacyWidth} vs ${currentWidth}`);
      console.error(`   Class: ${legacyClass} vs ${currentClass}`);
      console.error(`   Rel:   ${relLegacy} vs ${relNew}`);
      console.error(`   RR:    ${legacyRR} vs ${currentRR}`);
      console.error(`   Trend: ${legacyTrend} vs ${currentTrend}`);
      console.error(`   Signals: ${legacySignals} vs ${currentSignals}`);
    } else {
      console.log(`✅ ${sym} - MATCH`);
    }
  }

  if (failed) {
    console.error('\n❌ Regression Lock Failed! Core metrics have mutated. Build stopped.');
    process.exit(1);
  } else {
    console.log('\n✅ Regression Lock Passed! Core execution metrics are 100% stable.');
    process.exit(0);
  }
}

runRegressionLock().catch(e => {
  console.error(e);
  process.exit(1);
});
