import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { withTimeout } from './with-timeout';

export interface GuardedQueryOptions {
  statementTimeoutMs: number;
  label: string;
  applicationDeadlineMs?: number;
  client?: {
    $transaction: <R>(
      fn: (tx: Prisma.TransactionClient) => Promise<R>,
      options?: { timeout?: number; maxWait?: number }
    ) => Promise<R>;
  };
}

export class DatabaseQueryTimeoutError extends Error {
  public readonly code?: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'DatabaseQueryTimeoutError';
    this.code = code;
  }
}

/**
 * Executes a single database query inside an isolated interactive transaction with
 * a PostgreSQL engine-level `SET LOCAL statement_timeout = N`.
 *
 * Sequence:
 * 1. BEGIN transaction
 * 2. SET LOCAL statement_timeout = N (strictly transaction-scoped)
 * 3. Execute exactly one guarded raw query
 * 4. If execution exceeds N: PostgreSQL terminates query with SQLSTATE 57014
 * 5. Transaction rolls back and closes; connection returns cleanly to pool
 * 6. Outer withTimeout provides an additional application-level deadline safety net
 */
export async function executeGuardedQuery<T>(
  queryFn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: GuardedQueryOptions
): Promise<T> {
  const { statementTimeoutMs, label } = options;
  // Safety margin for Prisma interactive transaction timeout
  const prismaTxTimeoutMs = statementTimeoutMs + 5000;
  // Safety margin for application-side Promise.race deadline aligned with transaction timeout
  const appDeadlineMs = options.applicationDeadlineMs ?? prismaTxTimeoutMs;

  const txRunner = async (tx: Prisma.TransactionClient) => {
    // 1. Transaction-scoped statement timeout (milliseconds)
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
    // 2. Execute the guarded query
    return await queryFn(tx);
  };

  const txPromise = options.client
    ? options.client.$transaction(txRunner, { timeout: prismaTxTimeoutMs, maxWait: 5000 })
    : prisma.$transaction(txRunner, { timeout: prismaTxTimeoutMs, maxWait: 5000 });

  try {
    return await withTimeout(txPromise, appDeadlineMs, label);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = (err as Record<string, unknown>)?.code as string | undefined;

    // Detect PostgreSQL cancellation SQLSTATE 57014 (query_canceled)
    if (
      errMsg.includes('57014') ||
      errMsg.includes('canceling statement due to statement timeout') ||
      errMsg.includes('statement timeout') ||
      errCode === '57014'
    ) {
      throw new DatabaseQueryTimeoutError(
        `Database query '${label}' canceled by PostgreSQL engine statement_timeout (${statementTimeoutMs}ms)`,
        '57014'
      );
    }
    throw err;
  }
}
