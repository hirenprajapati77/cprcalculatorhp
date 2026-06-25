const fs = require('fs');
const file = 'src/components/scanner/ScannerClient.tsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('provisional') || line.toLowerCase().includes('premarket') || line.toLowerCase().includes('live')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
