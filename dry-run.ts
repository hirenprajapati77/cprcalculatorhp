import { EarningsPopulatorService } from './src/services/earnings-populator.service';

async function run() {
  try {
    console.log('Starting earnings population (DRY RUN)...');
    const result = await EarningsPopulatorService.populate(true);
    console.log('Dry Run Result:', result);
  } catch (err) {
    console.error('Failed to run dry-run populator:', err);
  }
}

run();
