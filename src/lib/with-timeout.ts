/**
 * Races a promise against a timeout. Does NOT cancel the underlying promise
 * (JS can't force-cancel an arbitrary in-flight operation) -- it only stops
 * *waiting* on it, so the caller's await resolves/rejects on schedule even if
 * the underlying operation is still hung. Callers with something genuinely
 * cancellable (e.g. fetch) should pass their own AbortSignal into that call
 * directly for a real fix; this is the generic safety net for whatever
 * doesn't (or can't).
 *
 * Built after a confirmed production incident (27-28 Aug 2026): a cron job's
 * un-timeouted fetch() hung indefinitely, leaving the caller's "is a job
 * currently running" flag stuck true for two full days and silently
 * blocking every subsequent scheduled job behind it.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
