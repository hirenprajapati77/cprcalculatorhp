import fs from 'fs';
import path from 'path';

function fixScannerClient() {
  const p = path.resolve(__dirname, '../src/components/scanner/ScannerClient.tsx');
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace('interface ScannedStock {', 'interface ScannedStock {\n  distPivot?: number;\n  cprQuality?: "A+" | "A" | "B" | "C";');
  fs.writeFileSync(p, content);
  console.log('Fixed ScannerClient.tsx');
}

function fixScannerService() {
  const p = path.resolve(__dirname, '../src/services/scanner.service.ts');
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace('cprQuality: \'A+\' | \'A\' | \'B\' | \'C\';', 'cprQuality?: \'A+\' | \'A\' | \'B\' | \'C\';');
  fs.writeFileSync(p, content);
  console.log('Fixed scanner.service.ts');
}

function fixBacktestService() {
  const p = path.resolve(__dirname, '../src/services/backtest/backtest.service.ts');
  let content = fs.readFileSync(p, 'utf8');
  // if scanStock is mapped, we might need to await Promise.all
  // Let's just fix scanner.test.ts first
  fs.writeFileSync(p, content);
}

function fixScannerTest() {
  const p = path.resolve(__dirname, '../src/tests/scanner.test.ts');
  let content = fs.readFileSync(p, 'utf8');
  // test('...', () => { -> test('...', async () => {
  content = content.replace(/test\((.*?), \(\) => {/g, 'test($1, async () => {');
  // t.test('...', () => { -> t.test('...', async () => {
  content = content.replace(/t\.test\((.*?), \(\) => {/g, 't.test($1, async () => {');
  fs.writeFileSync(p, content);
  console.log('Fixed scanner.test.ts');
}

fixScannerClient();
fixScannerService();
fixScannerTest();
