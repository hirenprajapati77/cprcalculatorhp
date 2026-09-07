import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = process.cwd();
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();

if (branch === 'main' || branch === 'master' || !branch) {
  throw new Error(`Refusing to apply on protected/default branch: ${branch || '(detached)'}`);
}

const servicePath = path.join(repo, 'src/services/market-tools/momentum-leaders.service.ts');
if (!fs.existsSync(servicePath)) {
  throw new Error(`Missing ${servicePath}`);
}

let source = fs.readFileSync(servicePath, 'utf8');

const importMarker = "import { FNO_SYMBOLS, getSymbolSector } from './market-breadth.service';";
const helperImport = "import { isValidHistoricalWindow } from './historical-window-validation';";

if (!source.includes(helperImport)) {
  if (!source.includes(importMarker)) {
    throw new Error('Could not find stable import marker; source shape has changed.');
  }
  source = source.replace(
    importMarker,
    `${importMarker}\n${helperImport}`,
  );
}

const oldSignature =
  "static computeCompoundedReturn(candles: OhlcvCandleWithPrevClose[], k: number): number | null {";

const newSignature =
  "static computeCompoundedReturn(\n" +
  "    candles: OhlcvCandleWithPrevClose[],\n" +
  "    k: number,\n" +
  "    expectedTradingDates: readonly string[] = [],\n" +
  "  ): number | null {";

if (source.includes(oldSignature)) {
  source = source.replace(oldSignature, newSignature);
} else if (!source.includes(newSignature)) {
  throw new Error('computeCompoundedReturn signature not found; source shape has changed.');
}

const oldGuard = "if (candles.length < k || k <= 0) return 0;";
const newGuard =
  "if (k <= 0 || candles.length < k) return null;\n" +
  "    if (expectedTradingDates.length > 0 && !isValidHistoricalWindow(candles, expectedTradingDates, k)) return null;";

if (source.includes(oldGuard)) {
  source = source.replace(oldGuard, newGuard);
} else if (!source.includes(newGuard)) {
  throw new Error('Insufficient-data guard not found; source shape has changed.');
}

const oldDateDeclaration = "const latestDate = dateRows[0]!.date;";
const newDateDeclaration =
  "const latestDate = dateRows[0]!.date;\n" +
  "    const canonicalTradingDates = dateRows\n" +
  "      .map(row => row.date)\n" +
  "      .slice(0, 21)\n" +
  "      .reverse();";

if (source.includes(oldDateDeclaration) && !source.includes('const canonicalTradingDates')) {
  source = source.replace(oldDateDeclaration, newDateDeclaration);
}

const replacements = [
  [
    "MomentumLeadersService.computeCompoundedReturn(candles, 1)",
    "MomentumLeadersService.computeCompoundedReturn(candles, 1, canonicalTradingDates)",
  ],
  [
    "MomentumLeadersService.computeCompoundedReturn(candles, 5)",
    "MomentumLeadersService.computeCompoundedReturn(candles, 5, canonicalTradingDates)",
  ],
  [
    "MomentumLeadersService.computeCompoundedReturn(candles, 10)",
    "MomentumLeadersService.computeCompoundedReturn(candles, 10, canonicalTradingDates)",
  ],
  [
    "MomentumLeadersService.computeCompoundedReturn(candles, 21)",
    "MomentumLeadersService.computeCompoundedReturn(candles, 21, canonicalTradingDates)",
  ],
];

for (const [from, to] of replacements) {
  source = source.replaceAll(from, to);
}

const oldComment =
  " * Compounded return across k trading sessions using exchange-adjusted prevClose.";

if (source.includes(oldComment) && !source.includes('canonical trading sessions')) {
  source = source.replace(
    oldComment,
    " * Compounded return across k consecutive canonical trading sessions using exchange-adjusted prevClose.",
  );
}

fs.writeFileSync(servicePath, source);
console.log(`Applied historical candle integrity changes to ${servicePath}`);
