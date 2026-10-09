/**
 * In-flight promise cache and short-cooldown response cache to deduplicate
 * simultaneous and rapid duplicate GET requests across scanner page mount.
 *
 * Each consumer receives an independent Response via `Response.clone()`,
 * so multiple concurrent callers can safely call `.json()` or `.text()`.
 */

export interface DedupedFetchOptions extends RequestInit {
  /** Time-to-live in ms for caching settled response. Default: 1000ms. */
  ttlMs?: number;
  /** If true, bypass cache and in-flight deduplication to force a fresh network fetch. */
  forceFresh?: boolean;
}

interface CachedResponseEntry {
  response: Response;
  expiresAt: number;
}

const inFlightRequests = new Map<string, Promise<Response>>();
const settledCache = new Map<string, CachedResponseEntry>();

export function clearDedupedFetchCache(urlPrefix?: string): void {
  if (!urlPrefix) {
    settledCache.clear();
    inFlightRequests.clear();
    return;
  }
  for (const key of settledCache.keys()) {
    if (key.startsWith(urlPrefix)) {
      settledCache.delete(key);
    }
  }
  for (const key of inFlightRequests.keys()) {
    if (key.startsWith(urlPrefix)) {
      inFlightRequests.delete(key);
    }
  }
}

export async function fetchDeduped(
  input: RequestInfo | URL,
  init?: DedupedFetchOptions
): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const forceFresh = init?.forceFresh ?? false;
  const ttlMs = init?.ttlMs ?? 1000;

  // Only deduplicate GET / HEAD requests without request body
  if (method !== 'GET' && method !== 'HEAD') {
    return fetch(input, init);
  }

  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;

  if (!forceFresh) {
    // 1. Check in-flight promise
    const inFlight = inFlightRequests.get(url);
    if (inFlight) {
      const res = await inFlight;
      return res.clone();
    }

    // 2. Check settled cache within TTL
    const cached = settledCache.get(url);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.response.clone();
    }
  }

  // 3. Initiate fetch and store in-flight promise
  const promise = (async () => {
    try {
      const res = await fetch(input, init);
      if (res.ok && ttlMs > 0) {
        settledCache.set(url, {
          response: res.clone(),
          expiresAt: Date.now() + ttlMs,
        });
      }
      return res;
    } finally {
      inFlightRequests.delete(url);
    }
  })();

  inFlightRequests.set(url, promise);
  const res = await promise;
  return res.clone();
}
