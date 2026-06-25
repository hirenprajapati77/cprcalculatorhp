const fs = require('fs');
const content = fs.readFileSync('src/components/scanner/ScannerClient.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('BtstStateBanner') || line.includes('useBtstState')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
