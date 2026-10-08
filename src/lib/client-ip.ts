import { env } from '@/config/env';

/**
 * Resolves the client IP for rate limiting, security gating, and auditing.
 *
 * Rules:
 * 1. Prefer `x-real-ip` when present (typically set by reverse proxies like nginx
 *    to the immediate peer client address).
 * 2. If `trustProxy` is true, parse `x-forwarded-for` and take the LAST hop, which
 *    reverse proxies such as nginx (`$proxy_add_x_forwarded_for`) append as the
 *    verified client IP. (Taking the first hop allows clients to spoof arbitrary IPs).
 * 3. Returns null if no reliable client IP could be determined.
 *
 * NOTE: Production deployments behind reverse proxies (nginx, Cloudflare) must configure
 * TRUST_PROXY=true and ensure the proxy sets X-Real-IP or X-Forwarded-For.
 */
export function resolveClientIp(
  headers: Headers | { get(name: string): string | null },
  trustProxy: boolean = env.TRUST_PROXY === 'true'
): string | null {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp;
  }

  if (trustProxy) {
    const forwardedFor = headers.get('x-forwarded-for');
    if (forwardedFor) {
      const hops = forwardedFor
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
      if (hops.length > 0) {
        return hops[hops.length - 1]!;
      }
    }
  }

  return null;
}
