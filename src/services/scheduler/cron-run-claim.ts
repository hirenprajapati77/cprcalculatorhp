/** In-process once-per-key guard for scheduled jobs (survives for PM2 process lifetime). */
const claimedKeys = new Set<string>();
const runningKeys = new Set<string>();

export function tryClaimCronRun(key: string): boolean {
  if (claimedKeys.has(key) || runningKeys.has(key)) return false;
  runningKeys.add(key);
  return true;
}

export function completeCronRun(key: string, retainClaim = true): void {
  runningKeys.delete(key);
  if (retainClaim) claimedKeys.add(key);
}

export function releaseCronRun(key: string): void {
  runningKeys.delete(key);
}

/** Test helper — reset state between unit tests. */
export function resetCronRunClaims(): void {
  claimedKeys.clear();
  runningKeys.clear();
}
