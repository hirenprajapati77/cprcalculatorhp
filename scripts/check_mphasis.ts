import { OptionChainService } from './src/services/option-chain.service';

async function run() {
  console.log("Fetching option chain for MPHASIS...");
  const res = await OptionChainService.getOptionChain('MPHASIS');
  if ('error' in res) {
    console.error("Error fetching option chain:", res.error);
  } else {
    console.log(`Method used: ${res.method}`);
    console.log(`Total options returned: ${res.optionsChain.length}`);
    console.log("First 10 options:");
    console.log(res.optionsChain.slice(0, 10));
    console.log("Strikes list:");
    const strikes = Array.from(new Set(res.optionsChain.map(o => o.strikePrice))).sort((a,b)=>a-b);
    console.log(strikes);
  }
  process.exit(0);
}

run();
