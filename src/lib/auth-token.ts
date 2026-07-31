/** Process-lifetime memo — APP_ACCESS_TOKEN is fixed for the worker, so rehashing on every middleware hit is pure waste. */
const hashCache = new Map<string, string>();

export async function hashToken(token: string): Promise<string> {
  const cached = hashCache.get(token);
  if (cached) return cached;

  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  hashCache.set(token, hash);
  return hash;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const aPadded = a.padEnd(maxLen, '\0');
  const bPadded = b.padEnd(maxLen, '\0');
  let result = 0;
  for (let i = 0; i < maxLen; i++) {
    result |= aPadded.charCodeAt(i) ^ bPadded.charCodeAt(i);
  }
  return result === 0 && a.length === b.length;
}
