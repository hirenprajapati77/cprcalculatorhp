import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const journals = await prisma.tradeJournal.findMany();
  console.log(`Loaded ${journals.length} live journal entries.`);
  
  if (journals.length === 0) {
    console.log("No journal entries found in database.");
    return;
  }

  // We want to filter for entries that have a resolved trade outcome (exitCmp or pnl is not null)
  const resolved = journals.filter(j => j.pnl !== null);
  console.log(`Resolved trades: ${resolved.length}`);

  // Let's inspect the unique signals in signalSummary
  const allSignals = new Set<string>();
  for (const j of resolved) {
    const sigs = j.signalSummary.split(',').map(s => s.trim());
    sigs.forEach(s => allSignals.add(s));
  }
  console.log("All signals seen in journals:", Array.from(allSignals));

  // Combinations
  let count_both = 0, win_both = 0, pnl_both = 0;
  let count_vwap_only = 0, win_vwap_only = 0, pnl_vwap_only = 0;
  let count_cs_only = 0, win_cs_only = 0, pnl_cs_only = 0;
  let count_neither = 0, win_neither = 0, pnl_neither = 0;

  let count_vwap_active = 0, win_vwap_active = 0, pnl_vwap_active = 0;
  let count_vwap_inactive = 0, win_vwap_inactive = 0, pnl_vwap_inactive = 0;

  let count_cs_active = 0, win_cs_active = 0, pnl_cs_active = 0;
  let count_cs_inactive = 0, win_cs_inactive = 0, pnl_cs_inactive = 0;

  // Since Option trades might not have a formal RR, we can use (pnl / entryCmp) or calculate RR based on outcomes.
  // Wait, let's check what PnL representation is. Option trades are usually percentage-based, or absolute cash PnL.
  // Let's calculate PnL % or average return.
  let sum_rr_both = 0, sum_rr_vwap = 0, sum_rr_cs = 0, sum_rr_neither = 0;
  
  for (const j of resolved) {
    const sigs = j.signalSummary.split(',').map(s => s.trim().toUpperCase());
    
    // Check if VWAP signal is present
    const hasVwap = sigs.includes('ABOVE_VWAP') || sigs.includes('BELOW_VWAP') || sigs.includes('VWAP');
    
    // Check if Close Strength is present
    const hasCs = sigs.includes('CLOSING_STRENGTH') || sigs.includes('CLOSING_WEAKNESS') || sigs.includes('CLOSE_STRENGTH');
    
    const pnl = j.pnl ?? 0;
    const won = pnl > 0;
    const ret = j.entryCmp > 0 ? pnl / j.entryCmp : 0; // Return relative to entry

    if (hasVwap) {
      count_vwap_active++;
      if (won) win_vwap_active++;
      pnl_vwap_active += ret;
    } else {
      count_vwap_inactive++;
      if (won) win_vwap_inactive++;
      pnl_vwap_inactive += ret;
    }

    if (hasCs) {
      count_cs_active++;
      if (won) win_cs_active++;
      pnl_cs_active += ret;
    } else {
      count_cs_inactive++;
      if (won) win_cs_inactive++;
      pnl_cs_inactive += ret;
    }

    if (hasVwap && hasCs) {
      count_both++;
      if (won) win_both++;
      pnl_both += ret;
      sum_rr_both += ret;
    } else if (hasVwap && !hasCs) {
      count_vwap_only++;
      if (won) win_vwap_only++;
      pnl_vwap_only += ret;
      sum_rr_vwap += ret;
    } else if (!hasVwap && hasCs) {
      count_cs_only++;
      if (won) win_cs_only++;
      pnl_cs_only += ret;
      sum_rr_cs += ret;
    } else {
      count_neither++;
      if (won) win_neither++;
      pnl_neither += ret;
      sum_rr_neither += ret;
    }
  }

  console.log("\n--- VWAP STATS ---");
  console.log(`VWAP Active:   Count = ${count_vwap_active}, Win Rate = ${(win_vwap_active/count_vwap_active*100).toFixed(2)}%, Avg Return = ${(pnl_vwap_active/count_vwap_active*100).toFixed(2)}%`);
  console.log(`VWAP Inactive: Count = ${count_vwap_inactive}, Win Rate = ${(win_vwap_inactive/count_vwap_inactive*100).toFixed(2)}%, Avg Return = ${(pnl_vwap_inactive/count_vwap_inactive*100).toFixed(2)}%`);

  console.log("\n--- CLOSE STRENGTH STATS ---");
  console.log(`CS Active:     Count = ${count_cs_active}, Win Rate = ${(win_cs_active/count_cs_active*100).toFixed(2)}%, Avg Return = ${(pnl_cs_active/count_cs_active*100).toFixed(2)}%`);
  console.log(`CS Inactive:   Count = ${count_cs_inactive}, Win Rate = ${(win_cs_inactive/count_cs_inactive*100).toFixed(2)}%, Avg Return = ${(pnl_cs_inactive/count_cs_inactive*100).toFixed(2)}%`);

  console.log("\n--- COMBINATION STATS ---");
  console.log(`Both Active:    Count = ${count_both}, Win Rate = ${(win_both/count_both*100).toFixed(2)}%, Avg Return = ${(pnl_both/count_both*100).toFixed(2)}%`);
  console.log(`VWAP Only:      Count = ${count_vwap_only}, Win Rate = ${(win_vwap_only/count_vwap_only*100).toFixed(2)}%, Avg Return = ${(pnl_vwap_only/count_vwap_only*100).toFixed(2)}%`);
  console.log(`CS Only:        Count = ${count_cs_only}, Win Rate = ${(win_cs_only/count_cs_only*100).toFixed(2)}%, Avg Return = ${(pnl_cs_only/count_cs_only*100).toFixed(2)}%`);
  console.log(`Neither Active: Count = ${count_neither}, Win Rate = ${(win_neither/count_neither*100).toFixed(2)}%, Avg Return = ${(pnl_neither/count_neither*100).toFixed(2)}%`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
