/** RSS / heap snapshot for health checks and ops monitoring on low-RAM VMs. */
export function getProcessMemorySnapshot() {
  const usage = process.memoryUsage();
  return {
    rssMb: Math.round(usage.rss / 1024 / 1024),
    heapUsedMb: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(usage.heapTotal / 1024 / 1024),
    externalMb: Math.round(usage.external / 1024 / 1024),
  };
}
