const https = require('https');

function fetchYahoo(ticker, range) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const time = Date.now() - start;
        const sizeBytes = Buffer.byteLength(data, 'utf8');
        try {
          const json = JSON.parse(data);
          const timestamps = json.chart?.result?.[0]?.timestamp || [];
          resolve({ time, sizeBytes, candles: timestamps.length });
        } catch(e) {
          console.error("Error parsing JSON:", data.substring(0, 50));
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function test() {
  const symbols = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS'];
  const ranges = ['6mo', '1y', '2y'];
  
  for (const range of ranges) {
    console.log(`\nTesting range=${range}`);
    let totalTime = 0;
    let totalSize = 0;
    let totalCandles = 0;
    let successCount = 0;
    
    for (const sym of symbols) {
      try {
        const res = await fetchYahoo(sym, range);
        totalTime += res.time;
        totalSize += res.sizeBytes;
        totalCandles += res.candles;
        successCount++;
        await wait(500); // polite delay
      } catch (e) {
        // ignore
      }
    }
    
    if (successCount === 0) {
      console.log("All requests failed for this range.");
      continue;
    }
    const avgTime = totalTime / successCount;
    const avgSize = totalSize / successCount;
    const avgCandles = totalCandles / successCount;
    
    console.log(`Avg Time: ${avgTime.toFixed(2)} ms`);
    console.log(`Avg Size: ${(avgSize/1024).toFixed(2)} KB`);
    console.log(`Avg Candles: ${avgCandles.toFixed(0)}`);
  }
}

test();
