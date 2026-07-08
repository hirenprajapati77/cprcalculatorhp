import { TradeJournalService } from './src/services/journal/trade-journal.service';

async function run() {
  console.log("Starting backfill for MPHASIS snapshot slots...");
  try {
    console.log("Triggering 9:16 AM snapshot...");
    await TradeJournalService.captureSnapshot('916');
    console.log("Triggering 9:30 AM snapshot...");
    await TradeJournalService.captureSnapshot('930');
    console.log("Triggering 9:45 AM snapshot...");
    await TradeJournalService.captureSnapshot('945');
    console.log("Triggering 10:00 AM snapshot...");
    await TradeJournalService.captureSnapshot('1000');
    console.log("Backfill completed successfully!");
  } catch (err) {
    console.error("Backfill failed:", err);
  }
  process.exit(0);
}

run();
