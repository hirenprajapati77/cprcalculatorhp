import fs from 'fs';
import path from 'path';

function replaceInFile(filePath: string, replacements: {from: RegExp | string, to: string}[]) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  // Add import if needed
  if (!content.includes('import {') && !content.includes('trading-constants')) {
      content = "import { VOLUME_THRESHOLDS, CPR_THRESHOLDS, ATR, BTST_SCORING, LIQUIDITY } from '@/config/trading-constants';\n" + content;
  } else if (!content.includes('trading-constants')) {
      content = content.replace(/(import .*?\n)/, "$1import { VOLUME_THRESHOLDS, CPR_THRESHOLDS, ATR, BTST_SCORING, LIQUIDITY } from '@/config/trading-constants';\n");
  }

  for (const {from, to} of replacements) {
    content = content.replace(from, to);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${filePath}`);
  }
}

// 1. signal.service.ts
replaceInFile(path.resolve(__dirname, '../src/services/signal.service.ts'), [
  { from: /volumeRatio >= 2\.0/g, to: 'volumeRatio >= VOLUME_THRESHOLDS.SPIKE_RATIO' },
  { from: /volumeRatio >= 1\.5/g, to: 'volumeRatio >= VOLUME_THRESHOLDS.BREAKOUT_RATIO' },
  { from: /0\.75 \* atrPct/g, to: 'ATR.BUILD_MULTIPLIER * atrPct' },
  { from: /0\.25 \* atrPct/g, to: 'ATR.UNWIND_MULTIPLIER * atrPct' }
]);

// 2. ranking.service.ts
replaceInFile(path.resolve(__dirname, '../src/services/ranking.service.ts'), [
  { from: /volumeRatio >= 1\.5/g, to: 'volumeRatio >= VOLUME_THRESHOLDS.BREAKOUT_RATIO' },
  { from: /volumeRatio >= 1\.2/g, to: 'volumeRatio >= VOLUME_THRESHOLDS.STRONG_RATIO' }
]);

// 3. btst.service.ts
replaceInFile(path.resolve(__dirname, '../src/services/backtest/btst.service.ts'), [
  { from: /\* 75\)/g, to: '* BTST_SCORING.CLV_BASE_MULTIPLIER)' },
  { from: /\? 100 : 75/g, to: '? BTST_SCORING.CLV_CONTINUOUS_MULTIPLIER : BTST_SCORING.CLV_BASE_MULTIPLIER' }
]);

// 4. overnight.service.ts
replaceInFile(path.resolve(__dirname, '../src/services/overnight/overnight.service.ts'), [
  { from: /stock\.history\.length < 15/g, to: 'stock.history.length < LIQUIDITY.MIN_HISTORY_FOR_RELIABLE_ATR' },
  { from: /HISTORY_FOR_RELIABLE_ATR \(15\)/g, to: 'HISTORY_FOR_RELIABLE_ATR (${LIQUIDITY.MIN_HISTORY_FOR_RELIABLE_ATR})' }
]);

console.log('Constants refactored.');
