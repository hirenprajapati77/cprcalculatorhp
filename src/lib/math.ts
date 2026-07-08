/**
 * Safe division/ratio calculation to prevent divide-by-zero, NaN, and Infinity propagation.
 * Returns `fallback` if the denominator is zero, NaN, or extremely close to zero.
 */
export function safeRatio(numerator: number, denominator: number, fallback = 0): number {
  if (isNaN(numerator) || isNaN(denominator) || Math.abs(denominator) < 1e-9) {
    return fallback;
  }
  return numerator / denominator;
}
