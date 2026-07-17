export interface Pagination {
  page: number;
  limit: number;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 500;

/**
 * Sanitizes untrusted page/limit query params into safe positive integers.
 * Guards against NaN, zero, negative, non-integer, and abusive page sizes so a
 * malformed request can never produce a negative Prisma `skip` (which throws) or
 * an unbounded `take` (which can OOM the journal query).
 */
export function sanitizePagination(
  rawPage: unknown,
  rawLimit: unknown,
  maxLimit: number = MAX_PAGE_LIMIT,
  defaultLimit: number = DEFAULT_PAGE_LIMIT
): Pagination {
  const page = toPositiveInt(rawPage, 1);
  const limit = Math.min(toPositiveInt(rawLimit, defaultLimit), maxLimit);
  return { page, limit };
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  const floored = Math.floor(n);
  return floored >= 1 ? floored : fallback;
}
