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

function bootstrapSpearmanCI(scores: number[], rs: number[], iterations = 2000, confidence = 0.95) {
  const rhos: number[] = [];
  const n = scores.length;
  for (let i = 0; i < iterations; i++) {
    const sampleScores: number[] = new Array(n);
    const sampleRs: number[] = new Array(n);
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(Math.random() * n);
      sampleScores[j] = scores[idx];
      sampleRs[j] = rs[idx];
    }
    rhos.push(spearmanCorrelation(sampleScores, sampleRs));
  }
  rhos.sort((a, b) => a - b);
  const lowerIdx = Math.floor((1 - confidence) / 2 * iterations);
  const upperIdx = Math.floor((1 - (1 - confidence) / 2) * iterations);
  return { lower: rhos[lowerIdx], upper: rhos[upperIdx] };
}

async function getTradesFromDb(dbPath: string) {
  process.env.DATABASE_URL = `file:./${dbPath}`;
  const runs = await prisma.backtestRun.findMany({ orderBy: { createdAt: 'desc' } });
  
  let clvTrades = [];
  for (const run of runs) {
    const trades = await prisma.trade.findMany({ where: { backtestRunId: run.id } });
    if (trades.length > 0) {
      const maxScore = Math.max(...trades.map(t => t.score || 0));
      if (maxScore > 65) {
        clvTrades = trades.filter(t => t.status !== 'OPEN' && t.status !== 'NEVER_TRIGGERED');
        break;
      }
    }
  }
  return clvTrades;
}

async function main() {
  const trades2024 = await getTradesFromDb('task-q.db');
  const scores2024 = trades2024.map(t => t.score || 0);
  const rs2024 = trades2024.map(t => t.rr || 0);
  const rho2024 = spearmanCorrelation(scores2024, rs2024);
  console.log(`2024 Spearman ρ: ${rho2024.toFixed(4)} (n=${trades2024.length})`);
  
  // Use a smaller iteration count for speed, 2000 is standard
  const ci2024 = bootstrapSpearmanCI(scores2024, rs2024, 2000);
  console.log(`2024 95% CI: [${ci2024.lower.toFixed(4)}, ${ci2024.upper.toFixed(4)}]`);

  // Disconnect so we can reconnect to task-r.db
  await prisma.$disconnect();

  const trades2023 = await getTradesFromDb('task-r.db');
  const scores2023 = trades2023.map(t => t.score || 0);
  const rs2023 = trades2023.map(t => t.rr || 0);
  const rho2023 = spearmanCorrelation(scores2023, rs2023);
  console.log(`\n2023 Spearman ρ: ${rho2023.toFixed(4)} (n=${trades2023.length})`);
  
  const ci2023 = bootstrapSpearmanCI(scores2023, rs2023, 2000);
  console.log(`2023 95% CI: [${ci2023.lower.toFixed(4)}, ${ci2023.upper.toFixed(4)}]`);

  await prisma.$disconnect();
}

main().catch(console.error);
