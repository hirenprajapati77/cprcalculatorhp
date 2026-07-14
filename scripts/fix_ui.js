const fs = require('fs');

// Fix route.ts
let routeContent = fs.readFileSync('src/app/api/scanner/route.ts', 'utf8');
routeContent = routeContent.replace(/const cprQuality = searchParams\.get\('cprQuality'\) \|\| 'ALL';[\s\n]*/, '');

const conditionIdx = routeContent.indexOf("if (cprQuality !== 'ALL') {");
if (conditionIdx !== -1) {
  const endIdx = routeContent.indexOf("}", conditionIdx);
  if (endIdx !== -1) {
    routeContent = routeContent.substring(0, conditionIdx) + routeContent.substring(endIdx + 1);
  }
}
fs.writeFileSync('src/app/api/scanner/route.ts', routeContent);
console.log('Fixed route.ts');

// Fix ScannerClient.tsx
let clientContent = fs.readFileSync('src/components/scanner/ScannerClient.tsx', 'utf8');
clientContent = clientContent.replace(/const \[cprQuality, setCprQuality\] = useState\('ALL'\);[\s\n]*/, '');
clientContent = clientContent.replace(/cprQuality,\s*/g, '');

const filterDropdownRegex = /<select[\s\S]*?value=\{cprQuality\}[\s\S]*?<\/select>/;
clientContent = clientContent.replace(filterDropdownRegex, '');

// Also remove the CPR Quality Badges rendering
const badgeRegex = /\{result\.cprQuality && \([\s\S]*?<\/span>[\s\n]*\)\}/g;
clientContent = clientContent.replace(badgeRegex, '');

fs.writeFileSync('src/components/scanner/ScannerClient.tsx', clientContent);
console.log('Fixed ScannerClient.tsx');
