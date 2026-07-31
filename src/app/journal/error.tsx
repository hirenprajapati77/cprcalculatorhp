'use client';

import { useEffect } from 'react';

/**
 * App Router error boundary for /journal — prevents a single render crash
 * (e.g. unexpected V2 breakdown shape) from wiping the whole page white.
 */
export default function JournalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Journal] Unhandled render error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold text-text-primary">Journal failed to render</h2>
      <p className="max-w-md text-sm text-text-secondary">
        Something went wrong while rendering the trade journal. You can retry without leaving the page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-accent-blue px-4 py-2 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
