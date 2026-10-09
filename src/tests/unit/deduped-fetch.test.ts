import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchDeduped, clearDedupedFetchCache } from '../../lib/deduped-fetch';

describe('fetchDeduped utility', () => {
  beforeEach(() => {
    clearDedupedFetchCache();
  });

  it('deduplicates concurrent in-flight GET requests to a single underlying network fetch', async () => {
    let nativeFetchCallCount = 0;
    const originalFetch = global.fetch;

    global.fetch = (async (_input: RequestInfo | URL) => {
      nativeFetchCallCount++;
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 20));
      return new Response(JSON.stringify({ success: true, count: nativeFetchCallCount }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof global.fetch;

    try {
      const url = '/api/test-dedupe-concurrent';
      // Fire 5 simultaneous requests to the same URL
      const results = await Promise.all([
        fetchDeduped(url).then((r) => r.json()),
        fetchDeduped(url).then((r) => r.json()),
        fetchDeduped(url).then((r) => r.json()),
        fetchDeduped(url).then((r) => r.json()),
        fetchDeduped(url).then((r) => r.json()),
      ]);

      assert.equal(nativeFetchCallCount, 1, 'underlying fetch must only be invoked once');
      for (const res of results) {
        assert.equal(res.success, true);
        assert.equal(res.count, 1);
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('allows each caller to independently consume the response stream body', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () => {
      await new Promise((r) => setTimeout(r, 10));
      return new Response(JSON.stringify({ payload: 'stream_test' }), { status: 200 });
    }) as typeof global.fetch;

    try {
      const url = '/api/test-stream-consumption';
      const [res1, res2] = await Promise.all([
        fetchDeduped(url),
        fetchDeduped(url),
      ]);

      const data1 = await res1.json();
      const data2 = await res2.json();
      assert.deepEqual(data1, { payload: 'stream_test' });
      assert.deepEqual(data2, { payload: 'stream_test' });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('serves sequential requests within TTL from settled cache without second fetch', async () => {
    let nativeFetchCallCount = 0;
    const originalFetch = global.fetch;

    global.fetch = (async () => {
      nativeFetchCallCount++;
      return new Response(JSON.stringify({ run: nativeFetchCallCount }), { status: 200 });
    }) as typeof global.fetch;

    try {
      const url = '/api/test-ttl-cache';
      const res1 = await fetchDeduped(url, { ttlMs: 1000 });
      const data1 = await res1.json();

      const res2 = await fetchDeduped(url, { ttlMs: 1000 });
      const data2 = await res2.json();

      assert.equal(nativeFetchCallCount, 1, 'must not re-fetch within TTL window');
      assert.equal(data1.run, 1);
      assert.equal(data2.run, 1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('bypasses cache when forceFresh is true or clearDedupedFetchCache is called', async () => {
    let nativeFetchCallCount = 0;
    const originalFetch = global.fetch;

    global.fetch = (async () => {
      nativeFetchCallCount++;
      return new Response(JSON.stringify({ run: nativeFetchCallCount }), { status: 200 });
    }) as typeof global.fetch;

    try {
      const url = '/api/test-force-fresh';
      await fetchDeduped(url);
      assert.equal(nativeFetchCallCount, 1);

      // forceFresh bypasses settled cache
      await fetchDeduped(url, { forceFresh: true });
      assert.equal(nativeFetchCallCount, 2);

      // clearDedupedFetchCache purges cache
      clearDedupedFetchCache(url);
      await fetchDeduped(url);
      assert.equal(nativeFetchCallCount, 3);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('passes non-GET requests directly to native fetch without caching', async () => {
    let nativeFetchCallCount = 0;
    const originalFetch = global.fetch;

    global.fetch = (async () => {
      nativeFetchCallCount++;
      return new Response(JSON.stringify({ postSuccess: true }), { status: 200 });
    }) as typeof global.fetch;

    try {
      const url = '/api/test-post';
      await fetchDeduped(url, { method: 'POST', body: JSON.stringify({ a: 1 }) });
      await fetchDeduped(url, { method: 'POST', body: JSON.stringify({ a: 1 }) });
      assert.equal(nativeFetchCallCount, 2, 'POST requests must never be deduped');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
