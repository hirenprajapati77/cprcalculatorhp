import { OptionChainService } from '../src/services/option-chain.service';

async function run() {
  const res = await OptionChainService.getOptionChain('DRREDDY');
  if ('error' in res) {
    console.error('Error:', res.error);
  } else {
    console.log('Result expiryData:', res.expiryData);
    console.log('First option symbol:', res.optionsChain[0]?.symbol);
  }
}
run();
