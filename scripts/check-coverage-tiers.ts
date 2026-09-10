import fs from 'node:fs';
import path from 'node:path';

interface MetricTotals {
  total: number;
  covered: number;
}

interface TierBucket {
  id: string;
  name: string;
  scope: string;
  pathMatcher: (normPath: string) => boolean;
  minLines: number;
  minBranches: number;
  minFunctions: number;
  lines: MetricTotals;
  branches: MetricTotals;
  functions: MetricTotals;
}

interface CoverageEntry {
  lines: { total: number; covered: number };
  branches: { total: number; covered: number };
  functions: { total: number; covered: number };
}

const TIERS: TierBucket[] = [
  {
    id: 'tier1',
    name: 'Tier 1: Core Lib',
    scope: 'src/lib/**',
    pathMatcher: (p) => p.includes('/src/lib/'),
    minLines: 90.0,
    minBranches: 85.0,
    minFunctions: 90.0,
    lines: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
    functions: { total: 0, covered: 0 },
  },
  {
    id: 'tier2',
    name: 'Tier 2: Trading Engine & Alerts',
    scope: 'src/services/{overnight,vpa,alert}/**',
    pathMatcher: (p) =>
      p.includes('/src/services/overnight/') ||
      p.includes('/src/services/vpa/') ||
      p.includes('/src/services/alert/'),
    minLines: 85.0,
    minBranches: 80.0,
    minFunctions: 90.0,
    lines: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
    functions: { total: 0, covered: 0 },
  },
  {
    id: 'tier3a',
    name: 'Tier 3A: Market Tools (Floor)',
    scope: 'src/services/market-tools/**',
    pathMatcher: (p) => p.includes('/src/services/market-tools/'),
    minLines: 64.0,
    minBranches: 70.0,
    minFunctions: 84.0,
    lines: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
    functions: { total: 0, covered: 0 },
  },
  {
    id: 'tier3b',
    name: 'Tier 3B: Backtest Engine (Floor)',
    scope: 'src/services/backtest/**',
    pathMatcher: (p) => p.includes('/src/services/backtest/'),
    minLines: 46.0,
    minBranches: 62.0,
    minFunctions: 79.0,
    lines: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
    functions: { total: 0, covered: 0 },
  },
];

function calcPct(covered: number, total: number): number {
  if (total === 0) return 100.0;
  return Number(((covered / total) * 100).toFixed(2));
}

function main(): void {
  const summaryPath = path.resolve(process.cwd(), 'coverage/coverage-summary.json');

  if (!fs.existsSync(summaryPath)) {
    console.error(`\x1b[31m[CoverageGovernance] Error: Summary not found at ${summaryPath}\x1b[0m`);
    console.error('Make sure to run test suite with c8 json-summary reporter before checking tiers.');
    process.exit(1);
  }

  const raw = fs.readFileSync(summaryPath, 'utf8');
  let summary: Record<string, CoverageEntry>;
  try {
    summary = JSON.parse(raw);
  } catch (err) {
    console.error('\x1b[31m[CoverageGovernance] Error: Failed to parse coverage summary JSON\x1b[0m', err);
    process.exit(1);
  }

  for (const [filePath, stats] of Object.entries(summary)) {
    if (filePath === 'total' || !stats || !stats.lines) continue;
    const normalized = filePath.replace(/\\/g, '/');

    for (const tier of TIERS) {
      if (tier.pathMatcher(normalized)) {
        tier.lines.total += stats.lines.total;
        tier.lines.covered += stats.lines.covered;
        tier.branches.total += stats.branches.total;
        tier.branches.covered += stats.branches.covered;
        tier.functions.total += stats.functions.total;
        tier.functions.covered += stats.functions.covered;
        break; // Match first applicable tier
      }
    }
  }

  console.log('\n================================================================================');
  console.log('                 TIERED CODE COVERAGE GOVERNANCE AUDIT REPORT                   ');
  console.log('================================================================================\n');

  let anyFailed = false;
  const failures: string[] = [];

  for (const tier of TIERS) {
    const linesPct = calcPct(tier.lines.covered, tier.lines.total);
    const branchesPct = calcPct(tier.branches.covered, tier.branches.total);
    const functionsPct = calcPct(tier.functions.covered, tier.functions.total);

    const linesPass = linesPct >= tier.minLines;
    const branchesPass = branchesPct >= tier.minBranches;
    const functionsPass = functionsPct >= tier.minFunctions;
    const tierPass = linesPass && branchesPass && functionsPass;

    if (!tierPass) {
      anyFailed = true;
      const reasons: string[] = [];
      if (!linesPass) reasons.push(`Lines: ${linesPct}% < ${tier.minLines}%`);
      if (!branchesPass) reasons.push(`Branches: ${branchesPct}% < ${tier.minBranches}%`);
      if (!functionsPass) reasons.push(`Functions: ${functionsPct}% < ${tier.minFunctions}%`);
      failures.push(`${tier.name} (${reasons.join(', ')})`);
    }

    const statusLabel = tierPass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`▶ ${tier.name} [${tier.scope}] — ${statusLabel}`);
    console.log(
      `  • Lines:     ${linesPass ? '\x1b[32m' : '\x1b[31m'}${linesPct}%\x1b[0m (req: >= ${tier.minLines}%) [${tier.lines.covered}/${tier.lines.total}]`
    );
    console.log(
      `  • Branches:  ${branchesPass ? '\x1b[32m' : '\x1b[31m'}${branchesPct}%\x1b[0m (req: >= ${tier.minBranches}%) [${tier.branches.covered}/${tier.branches.total}]`
    );
    console.log(
      `  • Functions: ${functionsPass ? '\x1b[32m' : '\x1b[31m'}${functionsPct}%\x1b[0m (req: >= ${tier.minFunctions}%) [${tier.functions.covered}/${tier.functions.total}]\n`
    );
  }

  console.log('--------------------------------------------------------------------------------');
  if (anyFailed) {
    console.error('\x1b[31m✖ TIERED COVERAGE GOVERNANCE FAILED:\x1b[0m');
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    console.error('\nPlease add targeted test coverage to bring all tiers above required thresholds.\n');
    process.exit(1);
  } else {
    console.log('\x1b[32m✔ All coverage tiers meet or exceed governance requirements!\x1b[0m\n');
    process.exit(0);
  }
}

main();
