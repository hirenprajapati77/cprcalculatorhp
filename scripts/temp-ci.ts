import { prisma } from '../src/lib/db';
function bootstrapCI(arr: number[], iterations = 10000, confidence = 0.95) {
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < arr.length; j++) {
      const idx = Math.floor(Math.random() * arr.length);
      sum += arr[idx];
    }
    means.push(sum / arr.length);
  }
  means.sort((a, b) => a - b);
  const lowerIdx = Math.floor((1 - confidence) / 2 * iterations);
  const upperIdx = Math.floor((1 - (1 - confidence) / 2) * iterations);
  return { lower: means[lowerIdx], upper: means[upperIdx] };
}
async function runFor(db: string) {
  process.env.DATABASE_URL = `file:./${db}`;
  const runs = await prisma.backtestRun.findMany({ orderBy: { createdAt: 'desc' } });
  let clvTrades = [];
  for (const run of runs) {
    const trades = await prisma.trade.findMany({ where: { backtestRunId: run.id } });
    if (trades.length > 0) { clvTrades = trades; break; }
  }
  const closedTrades = clvTrades.filter(t => t.status !== 'OPEN' && t.status !== 'NEVER_TRIGGERED');
  const topBandTrades = closedTrades.filter(t => (t.score || 0) >= 90 && (t.score || 0) <= 99);
  const topBandRs = topBandTrades.map(t => t.rr || 0);
  const ci = bootstrapCI(topBandRs);
  console.log(`${db} -> N=${topBandTrades.length}, CI = [${ci.lower.toFixed(4)}R, ${ci.upper.toFixed(4)}R]`);
  await prisma.$disconnect();
}
async function main() { await runFor('task-s-2024.db'); await runFor('task-s-2023.db'); }
main();
