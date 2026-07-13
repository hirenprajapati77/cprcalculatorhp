import { getISTTime } from '../src/lib/market-hours';

async function fetchQuote(sym: string) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result || !result.timestamp || result.timestamp.length === 0) throw new Error("No data");
    
    const meta = result.meta;
    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    const lastIdx = timestamps.length - 1;
    
    return {
        regularMarketPrice: meta.regularMarketPrice,
        barClose: quote.close[lastIdx],
        barHigh: quote.high[lastIdx],
        barLow: quote.low[lastIdx],
        barVolume: quote.volume[lastIdx],
        timestamp: timestamps[lastIdx]
    };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    const sym = 'RELIANCE.NS';
    const { dateString, totalMinutes } = getISTTime();
    console.log(`Market Check at ${dateString} (IST minute ${totalMinutes}) for ${sym}\n`);
    
    try {
        console.log(`--- FETCH 1 ---`);
        const data1 = await fetchQuote(sym);
        console.log(`meta.regularMarketPrice: ${data1.regularMarketPrice}`);
        console.log(`Last Bar Close         : ${data1.barClose}`);
        console.log(`Last Bar Volume        : ${data1.barVolume}`);
        
        console.log(`\nWaiting 15 seconds to observe changes...\n`);
        await sleep(15000);
        
        console.log(`--- FETCH 2 ---`);
        const data2 = await fetchQuote(sym);
        console.log(`meta.regularMarketPrice: ${data2.regularMarketPrice}`);
        console.log(`Last Bar Close         : ${data2.barClose}`);
        console.log(`Last Bar Volume        : ${data2.barVolume}`);
        
        console.log(`\n--- ANALYSIS ---`);
        const closeMatchesMeta = data2.barClose === data2.regularMarketPrice;
        const volumeChanged = data2.barVolume !== data1.barVolume;
        const closeChanged = data2.barClose !== data1.barClose;
        
        console.log(`Bar Close equals regularMarketPrice? : ${closeMatchesMeta}`);
        console.log(`Bar Volume changed?                  : ${volumeChanged}`);
        console.log(`Bar Close changed?                   : ${closeChanged}`);
        
        if (closeMatchesMeta && (volumeChanged || closeChanged)) {
            console.log(`\nVERDICT: CONFIRMED LIVE PARTIAL BAR`);
            console.log(`The daily bar is actively tracking live price/volume.`);
        } else if (!volumeChanged && !closeChanged) {
            console.log(`\nVERDICT: FROZEN / STATIC PLACEHOLDER`);
            console.log(`The bar did not update during the interval.`);
        } else {
            console.log(`\nVERDICT: INCONCLUSIVE OR MIXED`);
        }
        
    } catch (err: any) {
        console.error(`Error:`, err.message);
    }
}

run();
