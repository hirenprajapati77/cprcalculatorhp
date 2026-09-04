/** Process-lifetime memo — APP_ACCESS_TOKEN is fixed for the worker, so rehashing on every middleware hit is pure waste. */
const hashCache = new Map<string, string>();

export async function hashToken(token: string): Promise<string> {
  const cached = hashCache.get(token);
  if (cached) return cached;

  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  hashCache.set(token, hash);
  return hash;
}

/**
 * Constant-time comparison for authentication tokens (M-14).
 * Fully compatible with Next.js Edge Runtime (middleware) and Node.js runtime.
 * Eliminates character-by-character timing leaks without requiring Node.js native crypto.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 && b.length === 0) return true;

  const maxLen = Math.max(a.length, b.length);
  const aPadded = a.padEnd(maxLen, '\0');
  const bPadded = b.padEnd(maxLen, '\0');

  let mismatch = 0;
  for (let i = 0; i < maxLen; i++) {
    mismatch |= aPadded.charCodeAt(i) ^ bPadded.charCodeAt(i);
  }

  return mismatch === 0 && a.length === b.length;
}

