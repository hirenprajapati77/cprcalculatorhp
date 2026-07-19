/**
 * API paths that authenticate via x-cron-secret at the route (not APP_ACCESS_TOKEN).
 * Middleware must skip Bearer/cookie for these so runbook cron-secret calls work.
 */
export function isCronSecretExemptApiPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/btst/refresh') ||
    pathname.startsWith('/api/overnight/refresh')
  );
}
