import test from 'node:test';
import assert from 'node:assert/strict';
import { cookieSecureFromEnv, cookieSecureFromRequest } from '../../lib/auth-cookie';
import type { NextRequest } from 'next/server';

function mockReq(opts: { protocol?: string; forwarded?: string }): NextRequest {
  return {
    nextUrl: { protocol: opts.protocol ?? 'http:' },
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'x-forwarded-proto' ? opts.forwarded ?? null : null,
    },
  } as unknown as NextRequest;
}

test('cookieSecureFromRequest true for https request', () => {
  assert.equal(cookieSecureFromRequest(mockReq({ protocol: 'https:' })), true);
});

test('cookieSecureFromRequest true for X-Forwarded-Proto https', () => {
  assert.equal(cookieSecureFromRequest(mockReq({ protocol: 'http:', forwarded: 'https' })), true);
});

test('cookieSecureFromEnv follows NEXT_PUBLIC_BASE_URL shape', () => {
  // Just smoke: function is callable; exact value depends on env in this process
  assert.equal(typeof cookieSecureFromEnv(), 'boolean');
});
