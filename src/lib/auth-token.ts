import crypto from 'node:crypto';

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
 * Hashes both inputs with SHA-256 to ensure identical 32-byte buffer length
 * before calling native crypto.timingSafeEqual, eliminating length and character timing leaks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB) && a === b;
}

