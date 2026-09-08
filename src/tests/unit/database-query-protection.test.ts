import test from 'node:test';
import assert from 'node:assert/strict';
import { executeGuardedQuery, DatabaseQueryTimeoutError } from '../../lib/db-query-guard';
import { MARKET_TOOLS_QUERY_TIMEOUTS } from '../../config/trading-constants';
import type { Prisma } from '@prisma/client';

test('DatabaseQueryTimeoutError formats message and holds SQLSTATE 57014 code', () => {
  const err = new DatabaseQueryTimeoutError('test timeout', '57014');
  assert.equal(err.name, 'DatabaseQueryTimeoutError');
  assert.equal(err.code, '57014');
  assert.equal(err.message, 'test timeout');
  assert.ok(err instanceof Error);
});

test('MARKET_TOOLS_QUERY_TIMEOUTS defines explicit, positive timeout budgets', () => {
  assert.ok(MARKET_TOOLS_QUERY_TIMEOUTS.DATE_DISCOVERY_MS >= 5000);
  assert.ok(MARKET_TOOLS_QUERY_TIMEOUTS.MARKET_BREADTH_MS >= 10000);
  assert.ok(MARKET_TOOLS_QUERY_TIMEOUTS.PATTERN_BREAKOUT_MS >= 10000);
  assert.ok(MARKET_TOOLS_QUERY_TIMEOUTS.MOMENTUM_LEADERS_MS >= 10000);
  assert.ok(MARKET_TOOLS_QUERY_TIMEOUTS.MULTI_YEAR_BREAKOUT_MS >= 10000);
});

test('executeGuardedQuery issues SET LOCAL statement_timeout and returns query result', async () => {
  const executedStatements: string[] = [];
  const mockClient = {
    $transaction: async <R>(
      fn: (tx: Prisma.TransactionClient) => Promise<R>
    ): Promise<R> => {
      const mockTx = {
        $executeRawUnsafe: async (sql: string) => {
          executedStatements.push(sql);
          return 1;
        },
      } as unknown as Prisma.TransactionClient;
      return await fn(mockTx);
    },
  };

  const result = await executeGuardedQuery(
    async (_tx) => {
      return [{ id: 1, symbol: 'INFY' }];
    },
    {
      statementTimeoutMs: 15000,
      label: 'TestGuardedQuery.success',
      client: mockClient,
    }
  );

  assert.deepEqual(result, [{ id: 1, symbol: 'INFY' }]);
  assert.equal(executedStatements.length, 1);
  assert.equal(executedStatements[0], 'SET LOCAL statement_timeout = 15000');
});

test('executeGuardedQuery translates PostgreSQL 57014 canceling error into DatabaseQueryTimeoutError', async () => {
  const mockClient = {
    $transaction: async <R>(
      fn: (tx: Prisma.TransactionClient) => Promise<R>
    ): Promise<R> => {
      const mockTx = {
        $executeRawUnsafe: async () => 1,
      } as unknown as Prisma.TransactionClient;
      return await fn(mockTx);
    },
  };

  await assert.rejects(
    () =>
      executeGuardedQuery(
        async () => {
          const pgError = new Error('canceling statement due to statement timeout');
          (pgError as unknown as Record<string, unknown>).code = '57014';
          throw pgError;
        },
        {
          statementTimeoutMs: 5000,
          label: 'TestGuardedQuery.pg57014',
          client: mockClient,
        }
      ),
    (err: unknown) => {
      assert.ok(err instanceof DatabaseQueryTimeoutError);
      assert.equal((err as DatabaseQueryTimeoutError).code, '57014');
      assert.match(
        (err as DatabaseQueryTimeoutError).message,
        /Database query 'TestGuardedQuery\.pg57014' canceled by PostgreSQL engine statement_timeout \(5000ms\)/
      );
      return true;
    }
  );
});

test('executeGuardedQuery application deadline rejects hung interactive transactions', async () => {
  const mockClient = {
    $transaction: async <R>(): Promise<R> => {
      return new Promise(() => {});
    },
  };

  await assert.rejects(
    () =>
      executeGuardedQuery(
        async () => {
          return 'never';
        },
        {
          statementTimeoutMs: 50,
          applicationDeadlineMs: 60,
          label: 'TestGuardedQuery.hungAppDeadline',
          client: mockClient,
        }
      ),
    /TestGuardedQuery\.hungAppDeadline timed out after 60ms/
  );
});

test('executeGuardedQuery propagates regular application / DB errors unmodified', async () => {
  const mockClient = {
    $transaction: async <R>(
      fn: (tx: Prisma.TransactionClient) => Promise<R>
    ): Promise<R> => {
      const mockTx = {
        $executeRawUnsafe: async () => 1,
      } as unknown as Prisma.TransactionClient;
      return await fn(mockTx);
    },
  };

  await assert.rejects(
    () =>
      executeGuardedQuery(
        async () => {
          throw new Error('syntax error in SQL');
        },
        {
          statementTimeoutMs: 5000,
          label: 'TestGuardedQuery.syntaxError',
          client: mockClient,
        }
      ),
    /syntax error in SQL/
  );
});
