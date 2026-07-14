import fs from 'fs';
import path from 'path';

const symbols = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", 
  "SBIN", "BHARTIARTL", "ITC", "KOTAKBANK", "LT"
];

const legacy = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../legacy_results.json'), 'utf8'));
const current = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../new_results.json'), 'utf8'));

let md = `| Symbol | Relationship | Virgin | Width | Classification | Score | Entry | Target | Result |\n`;
md += `|---|---|---|---|---|---|---|---|---|\n`;

for (const sym of symbols) {
  if (!legacy[sym] || !current[sym]) continue;
  const leg = legacy[sym];
  const cur = current[sym];
  
  const relLegacy = leg.signals.find((s: string) => s.includes('VALUE'));
  const relNew = cur.signals.find((s: string) => s.includes('VALUE') || s.startsWith('CPR_REL_'));
  
  const virginLegacy = leg.signals.includes('VIRGIN') ? 'Y' : 'N';
  const virginNew = cur.signals.includes('VIRGIN') ? 'Y' : 'N';
  
  const relMatch = relLegacy === relNew?.replace('CPR_REL_', ''); // roughly speaking, since we added the prefix. Actually, if we kept legacy tags, it should match.
  const isMatch = leg.score === cur.score && Number(leg.entry).toFixed(2) === Number(cur.entry).toFixed(2) && Number(leg.target).toFixed(2) === Number(cur.target).toFixed(2);
  const res = isMatch ? '✅ MATCH' : '❌ FAIL';

  md += `| ${sym} | ${relLegacy} / ${relNew?.replace('CPR_REL_', '') || relNew} | ${virginLegacy} / ${virginNew} | ${Number(leg.width).toFixed(3)} / ${Number(cur.width).toFixed(3)} | ${leg.classification} / ${cur.classification} | ${leg.score} / ${cur.score} | ${Number(leg.entry).toFixed(2)} / ${Number(cur.entry).toFixed(2)} | ${Number(leg.target).toFixed(2)} / ${Number(cur.target).toFixed(2)} | ${res} |\n`;
}

console.log(md);
