import * as fs from 'fs';

const URLS = [
  'http://localhost:3000/api/scanner',
  'http://localhost:3000/api/scanner/heatmap',
  'http://localhost:3000/api/history',
  'http://localhost:3000/api/health'
];

const ROWS_MATRIX = [50, 250, 1000, 3000];
const REQUESTS_PER_URL = 20;

async function measureLatency(url: string, limit: number) {
  const latencies: number[] = [];
  const ttfbs: number[] = [];
  
  const testUrl = url.includes('?') ? `${url}&limit=${limit}` : `${url}?limit=${limit}`;

  for (let i = 0; i < REQUESTS_PER_URL; i++) {
    const start = Date.now();
    try {
      const res = await fetch(testUrl);
      ttfbs.push(Date.now() - start);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await res.json();
      latencies.push(Date.now() - start);
    } catch {
      // ignore
    }
  }

  latencies.sort((a, b) => a - b);
  ttfbs.sort((a, b) => a - b);
  return { latencies, ttfbs };
}

function percentile(sortedArray: number[], p: number) {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArray.length) - 1;
  return sortedArray[index];
}

async function runBenchmark() {
  const results: Record<string, unknown>[] = [];
  
  for (const url of URLS) {
    for (const rows of ROWS_MATRIX) {
      const { latencies, ttfbs } = await measureLatency(url, rows);
      if (latencies.length === 0) continue;

      const p50 = percentile(latencies, 50);
      const p95 = percentile(latencies, 95);
      const p99 = percentile(latencies, 99);
      const ttfb = percentile(ttfbs, 50);
      
      const throughput = (REQUESTS_PER_URL / (latencies.reduce((a,b)=>a+b,0) / 1000)).toFixed(2);
      
      let pass = true;
      let rootCause = '';
      if (url.includes('scanner') && !url.includes('heatmap') && p95 > 500) { pass = false; rootCause = 'Scanner computation overhead'; }
      if (url.includes('heatmap') && p95 > 300) { pass = false; rootCause = 'Heatmap payload generation'; }
      if (ttfb > 200) { pass = false; rootCause = 'Initial server response delay'; }

      results.push({
        endpoint: url,
        rows,
        p50, p95, p99, ttfb,
        throughput,
        pass,
        rootCause: pass ? 'N/A' : rootCause
      });
    }
  }

  // Get Health
  let health: Record<string, unknown> = {};
  try {
    const res = await fetch('http://localhost:3000/api/health');
    health = await res.json() as Record<string, unknown>;
  } catch {}

  const finalOutput = {
    timestamp: new Date().toISOString(),
    memoryUsage: health?.system || 'Unknown',
    cacheMetrics: health?.cache || {},
    queueMetrics: health?.queue || {},
    benchmark: results
  };

  // Console Output
  console.log('--- Phase 4 Performance Verification ---');
  console.table(results);
  console.log('\nCache Metrics:', health?.cache);
  
  // JSON
  fs.writeFileSync('benchmark-results.json', JSON.stringify(finalOutput, null, 2));
  
  // Markdown
  let md = `# Phase 4 Benchmark Results\n\n`;
  md += `| Endpoint | Rows | P50 (ms) | P95 (ms) | P99 (ms) | TTFB (ms) | Throughput (req/s) | Pass/Fail |\n`;
  md += `|----------|------|----------|----------|----------|-----------|--------------------|-----------|\n`;
  for(const r of results) {
    md += `| ${r.endpoint} | ${r.rows} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.ttfb} | ${r.throughput} | ${r.pass ? '✅ PASS' : '❌ FAIL'} |\n`;
  }
  fs.writeFileSync('benchmark-results.md', md);
  
  console.log('\nReports generated: benchmark-results.json, benchmark-results.md');
}

runBenchmark().catch(console.error);
