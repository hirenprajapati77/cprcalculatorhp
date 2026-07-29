import { runCprJournalJob } from '../src/services/scheduler/cpr-journal.job';
import { runBtstJournalJob } from '../src/services/scheduler/btst-journal.job';

async function main() {
  console.log('Running CPR Journal...');
  const cprRes = await runCprJournalJob();
  console.log('CPR Res:', JSON.stringify(cprRes, null, 2));

  console.log('Running BTST Journal...');
  const btstRes = await runBtstJournalJob();
  console.log('BTST Res:', JSON.stringify(btstRes, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
