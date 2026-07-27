/** Mask chat IDs in API responses (keep last 4 chars). */
export function maskSecretTail(value: string | null | undefined): string {
  if (!value) return '';
  const v = String(value);
  if (v.length <= 4) return '****';
  return '*'.repeat(v.length - 4) + v.slice(-4);
}
