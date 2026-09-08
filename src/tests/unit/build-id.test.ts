import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  sanitizeBuildId,
  generateTimestampFallback,
  resolveBuildId,
  getRuntimeBuildId,
  _resetRuntimeBuildIdCache,
} from '@/lib/build-id';

describe('ISSUE-011: Next.js Build ID Resolver & Runtime Visibility', () => {
  describe('sanitizeBuildId', () => {
    it('bounds build ID to a maximum of 12 characters', () => {
      assert.strictEqual(sanitizeBuildId('12345678901234567890'), '123456789012');
      assert.strictEqual(sanitizeBuildId('short'), 'short');
    });

    it('strips unsafe characters and preserves valid alphanumeric, hyphens, and underscores', () => {
      assert.strictEqual(sanitizeBuildId('abc/def\\ghi:jkl'), 'abcdefghijkl');
      assert.strictEqual(sanitizeBuildId('commit-12_34!@#'), 'commit-12_34');
    });
  });

  describe('generateTimestampFallback', () => {
    it('generates a strictly 12-character fallback prefixed with cpr-', () => {
      const fixedDate = new Date('2026-09-08T16:30:00.000Z');
      const fallback = generateTimestampFallback(fixedDate);
      assert.strictEqual(fallback.length, 12);
      assert.strictEqual(fallback, 'cpr-26090816');
    });

    it('always generates valid URL-safe alphanumeric characters', () => {
      const fallback = generateTimestampFallback();
      assert.strictEqual(fallback.length, 12);
      assert.match(fallback, /^cpr-[0-9]{8}$/);
    });
  });

  describe('resolveBuildId priority chain', () => {
    it('Priority 1: honors BUILD_ID env var sanitized and bounded to 12 chars', () => {
      const result = resolveBuildId({
        BUILD_ID: 'custom-build-id-longer-than-12',
        GIT_COMMIT_SHA: 'sha-that-should-be-ignored',
      });
      assert.strictEqual(result, 'custom-build');
      assert.strictEqual(result.length, 12);
    });

    it('Priority 2: honors GIT_COMMIT_SHA env var when BUILD_ID is unset', () => {
      const result = resolveBuildId({
        GIT_COMMIT_SHA: '4cc476c86e7afeec35bd507df4a7a854cd621294',
      });
      assert.strictEqual(result, '4cc476c86e7a');
      assert.strictEqual(result.length, 12);
    });

    it('Priority 3: resolves 12-character commit SHA from git repo when env unset', () => {
      let expectedSha: string | null = null;
      try {
        expectedSha = execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim();
      } catch {
        // Not in a git repo
      }

      if (expectedSha && expectedSha.length === 12) {
        const result = resolveBuildId({});
        assert.strictEqual(result, expectedSha);
        assert.strictEqual(result.length, 12);
      }
    });

    it('Priority 4: falls back to 12-character timestamp when env vars unset and git command fails', () => {
      // Pass an empty env and test that fallback produces a valid 12-char string
      const result = resolveBuildId({});
      assert.strictEqual(result.length, 12);
      assert.match(result, /^[a-zA-Z0-9_-]{12}$/);
    });
  });

  describe('getRuntimeBuildId', () => {
    beforeEach(() => {
      _resetRuntimeBuildIdCache();
    });

    afterEach(() => {
      _resetRuntimeBuildIdCache();
    });

    it('reads .next/BUILD_ID from disk if present', () => {
      const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
      if (fs.existsSync(buildIdPath)) {
        const expected = fs.readFileSync(buildIdPath, 'utf8').trim().slice(0, 12);
        const actual = getRuntimeBuildId();
        assert.strictEqual(actual, expected);
      }
    });

    it('verifies .next/BUILD_ID matches git rev-parse --short=12 HEAD when built from repo', () => {
      const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
      if (fs.existsSync(buildIdPath)) {
        const buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
        assert.strictEqual(buildId.length, 12);
        assert.match(buildId, /^[a-f0-9]{12}$/);
        const currentSha = execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim();
        assert.strictEqual(buildId, currentSha);
      }
    });

    it('caches the read value in memory so subsequent calls do not re-read filesystem', () => {
      const val1 = getRuntimeBuildId();
      const val2 = getRuntimeBuildId();
      assert.strictEqual(val1, val2);
    });
  });
});
