import { compareCpr } from '../src/lib/cpr-relationship';
import { calculateCPR } from '../src/lib/cpr-engine';

function randomOhlc() {
  const open = 100 + Math.random() * 50;
  const high = open + Math.random() * 10;
  const low = open - Math.random() * 10;
  const close = low + Math.random() * (high - low);
  return { high, low, close };
}

let identical = 0;
let failed = 0;

for (let i = 0; i < 10000; i++) {
  const todayCpr = calculateCPR(randomOhlc());
  const tomorrowCpr = calculateCPR(randomOhlc());

  // Legacy Logic from BTST / Signal Service
  const legacyInsideValue = tomorrowCpr.bc >= todayCpr.bc && tomorrowCpr.tc <= todayCpr.tc;
  const legacyHigherValue = tomorrowCpr.bc > todayCpr.bc && tomorrowCpr.tc > todayCpr.tc;
  const legacyLowerValue  = tomorrowCpr.bc < todayCpr.bc && tomorrowCpr.tc < todayCpr.tc;
  const legacyOverlappingValue = !legacyInsideValue && !legacyHigherValue && !legacyLowerValue &&
                                 tomorrowCpr.bc <= todayCpr.tc && tomorrowCpr.tc >= todayCpr.bc;

  // New utility
  const result = compareCpr(todayCpr, tomorrowCpr);

  const isMatch = result.isInsideValue === legacyInsideValue &&
                  result.isHigherValue === legacyHigherValue &&
                  result.isLowerValue === legacyLowerValue &&
                  result.isOverlappingValue === legacyOverlappingValue;

  if (isMatch) {
    identical++;
  } else {
    failed++;
  }
}

console.log(`Verified 10,000 random CPR pairs.`);
console.log(`Identical: ${identical}`);
console.log(`Failed: ${failed}`);
if (failed === 0) {
  console.log(`100% identical. Safe to replace.`);
} else {
  console.log(`Mismatches found! Do not replace.`);
  process.exit(1);
}
