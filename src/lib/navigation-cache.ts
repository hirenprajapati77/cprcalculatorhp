/**
  * Central registry of memory cache clear callbacks across client components.
  * Ensures that logging out or resetting sessions completely purges stale in-memory data.
  */

type ClearCallback = () => void;
const clearCallbacks = new Set<ClearCallback>();

export function registerCacheClearHandler(cb: ClearCallback): () => void {
  clearCallbacks.add(cb);
  return () => {
    clearCallbacks.delete(cb);
  };
}

export function clearNavigationCaches(): void {
  clearCallbacks.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore
    }
  });
}
