import { EarningsPopulatorService } from './src/services/earnings-populator.service';

async function run() {
  try {
    console.log('Starting earnings population...');
    const result = await EarningsPopulatorService.populate();
    console.log('Result:', result);
  } catch (err) {
    console.error('Failed to run populator:', err);
  }
}

run();
