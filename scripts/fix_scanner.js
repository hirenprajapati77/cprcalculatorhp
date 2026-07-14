const fs = require('fs');

let c = fs.readFileSync('src/services/scanner.service.ts', 'utf8');

c = c.replace(/cprQuality\?\:\s*'A\+'\s*\|\s*'A'\s*\|\s*'B'\s*\|\s*'C'\s*\|\s*undefined;/, '');

// Find the block from `let cprQuality: ` to the end of the `if (env.ENABLE_EXPERIMENTAL_CPR_QUALITY === 'true') { ... }` block
const startIdx = c.indexOf("let cprQuality:");
const endIdx = c.indexOf("// 4. Trade Setup V3");

if (startIdx !== -1 && endIdx !== -1) {
  c = c.substring(0, startIdx) + c.substring(endIdx);
}

c = c.replace(/cprCompression,[\s\n]+cprQuality/, 'cprCompression');
c = c.replace(/cprCompression: CprCompressionStats \| null;[\s\n]+\}/, 'cprCompression?: CprCompressionStats | null;\n}');

fs.writeFileSync('src/services/scanner.service.ts', c);
console.log('Fixed scanner.service.ts');
