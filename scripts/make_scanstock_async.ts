import fs from 'fs';
import path from 'path';

function replaceInFile(filepath: string) {
  const p = path.resolve(__dirname, filepath);
  let content = fs.readFileSync(p, 'utf8');
  content = content.replace(/ScannerService\.scanStock\(/g, 'await ScannerService.scanStock(');
  // fix double await if any
  content = content.replace(/await await ScannerService/g, 'await ScannerService');
  fs.writeFileSync(p, content);
  console.log('Updated', filepath);
}

replaceInFile('../src/tests/scanner.test.ts');
replaceInFile('../src/services/backtest/btst.service.ts');
replaceInFile('../src/services/scanner-controller.ts');
