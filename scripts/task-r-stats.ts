import { prisma } from '../src/lib/db';

function spearmanCorrelation(x: number[], y: number[]) {
  const getRanks = (arr: number[]) => {
    const sorted = [...arr].map((val, i) => ({ val, i })).sort((a, b) => a.val - b.val);
    const ranks = new Array(arr.length);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length && sorted[j].val === sorted[i].val) j++;
      const avgRank = (i + j - 1) / 2 + 1;
      for (let k = i; k < j; k++) ranks[sorted[k].i] = avgRank;
      i = j;
    }
    return ranks;
  };
  
  const rankX = getRanks(x);
  const rankY = getRanks(y);
  
  const meanX = rankX.reduce((a, b) => a + b, 0) / rankX.length;
  const meanY = rankY.reduce((a, b) => a + b, 0) / rankY.length;
  
  let num = 0, den1 = 0, den2 = 0;
  for (let i = 0; i < rankX.length; i++) {
    const dx = rankX[i] - meanX;
    const dy = rankY[i] - meanY;
    num += dx * dy;
    den1 += dx * dx;
    den2 += dy * dy;
  }
  
  return num / Math.sqrt(den1 * den2);
}

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

async function main() {
  process.env.DATABASE_URL = process.env.DATABASE_URL;
  const runs = await prisma.backtestRun.findMany({
    orderBy: { createdAt: 'desc' }
  });

  // Find the CLV Continuous run from task-q.db.
  // We identify it by its name or by having trades with score > 65.
  let clvRun = null;
  let clvTrades = [];
  for (const run of runs) {
    const trades = await prisma.trade.findMany({ where: { backtestRunId: run.id } });
    if (trades.length > 0) {
      const maxScore = Math.max(...trades.map(t => t.score || 0));
      if (maxScore > 65) {
        clvRun = run;
        clvTrades = trades;
        break;
      }
    }
  }

  if (!clvRun) {
    console.log("Could not find CLV Continuous run in task-q.db");
    return;
  }

  const closedTrades = clvTrades.filter(t => t.status !== 'OPEN' && t.status !== 'NEVER_TRIGGERED');
  
  const scores = closedTrades.map(t => t.score || 0);
  const rs = closedTrades.map(t => t.rr || 0);

  const spearman = spearmanCorrelation(scores, rs);
  console.log(`--- Spearman Rank Correlation (Raw Trades) ---`);
  console.log(`N = ${closedTrades.length}`);
  console.log(`Spearman ρ = ${spearman.toFixed(4)}`);

  // Bootstrap CI for 90-99 band
  const topBandTrades = closedTrades.filter(t => {
    const s = Math.floor(t.score || 0);
    return s >= 90 && s <= 99;
  });

  const topBandRs = topBandTrades.map(t => t.rr || 0);
  const pointEstimate = topBandRs.reduce((a, b) => a + b, 0) / topBandRs.length;
  
  console.log(`\n--- Bootstrap 95% CI (Score 90-99) ---`);
  console.log(`N = ${topBandTrades.length}`);
  console.log(`Point Estimate Mean = ${pointEstimate.toFixed(4)}R`);
  
  const ci = bootstrapCI(topBandRs);
  console.log(`95% CI = [${ci.lower.toFixed(4)}R, ${ci.upper.toFixed(4)}R]`);

  await prisma.$disconnect();
}

main().catch(console.error);
