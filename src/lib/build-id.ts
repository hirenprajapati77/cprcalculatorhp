import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Sanitizes and bounds a build ID to safe characters and maximum 12 characters.
 */
export function sanitizeBuildId(val: string): string {
  return val.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12);
}

/**
 * Generates a strictly 12-character fallback identifier from UTC timestamp:
 * Format: 'cpr-' + YYMMDDHH (exactly 12 alphanumeric/hyphen characters)
 */
export function generateTimestampFallback(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yy = date.getUTCFullYear().toString().slice(2);
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  return `cpr-${yy}${mm}${dd}${hh}`;
}

/**
 * Resolves the 12-character build ID at build-time.
 * Priority:
 *   1. BUILD_ID environment variable (sanitized, max 12 chars)
 *   2. GIT_COMMIT_SHA environment variable (first 12 chars)
 *   3. git rev-parse --short=12 HEAD (executed during build only)
 *   4. Timestamp fallback (strictly 12 characters)
 */
export function resolveBuildId(env: Record<string, string | undefined> = process.env): string {
  // 1. BUILD_ID env var
  if (env.BUILD_ID?.trim()) {
    const sanitized = sanitizeBuildId(env.BUILD_ID.trim());
    if (sanitized.length > 0) return sanitized;
  }

  // 2. GIT_COMMIT_SHA env var
  if (env.GIT_COMMIT_SHA?.trim()) {
    const sanitized = sanitizeBuildId(env.GIT_COMMIT_SHA.trim());
    if (sanitized.length > 0) return sanitized;
  }

  // 3. git rev-parse --short=12 HEAD
  try {
    const gitSha = execSync('git rev-parse --short=12 HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    })
      .toString()
      .trim();
    const sanitized = sanitizeBuildId(gitSha);
    if (sanitized.length === 12) return sanitized;
    if (sanitized.length > 0) return sanitized.padEnd(12, '0');
  } catch {
    // Git not available or repo not present
  }

  // 4. Timestamp fallback
  return generateTimestampFallback();
}

let cachedRuntimeBuildId: string | null = null;

/**
 * Reads the build ID from .next/BUILD_ID at runtime without executing Git commands.
 * Result is cached in memory ($O(1)$) to eliminate filesystem overhead on subsequent calls.
 */
export function getRuntimeBuildId(): string {
  if (cachedRuntimeBuildId !== null) {
    return cachedRuntimeBuildId;
  }

  try {
    const candidates = [
      path.join(process.cwd(), '.next', 'BUILD_ID'),
      path.join(__dirname, '..', '..', '.next', 'BUILD_ID'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const id = fs.readFileSync(p, 'utf8').trim();
        if (id) {
          cachedRuntimeBuildId = sanitizeBuildId(id);
          return cachedRuntimeBuildId;
        }
      }
    }
  } catch {
    // ignore
  }

  const fallback = process.env.BUILD_ID?.trim() ? sanitizeBuildId(process.env.BUILD_ID.trim()) : 'development';
  cachedRuntimeBuildId = fallback;
  return cachedRuntimeBuildId;
}

/** Reset runtime build ID cache (for testing) */
export function _resetRuntimeBuildIdCache(): void {
  cachedRuntimeBuildId = null;
}
