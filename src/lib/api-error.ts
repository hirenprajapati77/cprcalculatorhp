/**
 * Safe client-facing API error text. Log the real error server-side;
 * never leak stack/DB messages to browsers in production.
 */
export function publicApiError(
  err: unknown,
  fallback = 'Internal server error'
): string {
  if (process.env.NODE_ENV === 'development' && err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
