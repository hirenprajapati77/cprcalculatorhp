const fs = require('fs');

let clientContent = fs.readFileSync('src/components/scanner/ScannerClient.tsx', 'utf8');

// 1. Add state variable
if (!clientContent.includes('const [isDegraded, setIsDegraded] = useState(false);')) {
  clientContent = clientContent.replace(
    /const \[isExecutionWindowOpen, setExecutionWindowOpen\] = useState\(false\);/,
    "const [isExecutionWindowOpen, setExecutionWindowOpen] = useState(false);\n  const [isDegraded, setIsDegraded] = useState(false);"
  );
}

// 2. Set degraded state in fetchScannerData (around line 1238)
clientContent = clientContent.replace(
  /setScannedAt\(''\);/,
  "setScannedAt('');\n        setIsDegraded(!!data.degraded);"
);

// 3. Set degraded state in BTST fetch (around line 1070 is BTST API call)
const btstIdx = clientContent.indexOf('const res = await fetch(`/api/btst?universe=${universe}${bypassVal ? \'&bypass=true\' : \'\'}`);');
if (btstIdx !== -1) {
  const dataIdx = clientContent.indexOf('const data = await res.json();', btstIdx);
  if (dataIdx !== -1) {
    clientContent = clientContent.replace(
      /const data = await res\.json\(\);\s*if \(data\.success\) {/,
      "const data = await res.json();\n      if (data.success) {\n        setIsDegraded(!!data.degraded);"
    );
  }
}

// 4. Render the degraded warning badge in the header (near the "Last Scan" text)
const headerRegex = /<span className="text-xs text-slate-400 font-mono">([^<]+)<\/span>/;
if (clientContent.match(headerRegex) && !clientContent.includes('Data Degraded')) {
  clientContent = clientContent.replace(
    headerRegex,
    `<span className="text-xs text-slate-400 font-mono">$1</span>
            {isDegraded && (
              <Badge variant="outline" className="border-amber-500/30 text-amber-500 ml-3 bg-amber-500/10 gap-1 animate-pulse">
                <AlertTriangle className="h-3 w-3" />
                Data Degraded (DB Offline)
              </Badge>
            )}`
  );
}

fs.writeFileSync('src/components/scanner/ScannerClient.tsx', clientContent);
console.log('Fixed ScannerClient.tsx to show degraded state.');
