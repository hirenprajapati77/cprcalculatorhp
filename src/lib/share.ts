import crypto from 'crypto';

/**
 * Generates a unique 12-character hex share token (e.g. 'a8b3d6f1c2d4').
 */
export function generateShareToken(): string {
  return crypto.randomBytes(6).toString('hex');
}
