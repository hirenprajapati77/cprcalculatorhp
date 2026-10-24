export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN',     // DB is down, fail fast
  HALF_OPEN = 'HALF_OPEN' // Probe phase
}

function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (
    error.name === 'PrismaClientInitializationError' ||
    error.name === 'PrismaClientRustPanicError'
  ) {
    return true;
  }
  const code = (error as { code?: string }).code;
  if (code && typeof code === 'string') {
    if (['P1000', 'P1001', 'P1002', 'P1008', 'P1011', 'P1017'].includes(code)) {
      return true;
    }
  }
  const msg = (error.message ?? '').toLowerCase();
  const tlsPatterns = ['p1011', 'tls ', 'ssl ', 'certificate', 'handshake failed', 'cert_', 'self signed'];
  if (tlsPatterns.some((p) => msg.includes(p))) return true;
  return (
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('eai_again') ||
    msg.includes('connection closed') ||
    msg.includes('connection terminated') ||
    msg.includes('timed out waiting for a connection from the pool') ||
    msg.includes('remaining connection slots are reserved') ||
    msg.includes('too many clients') ||
    msg.includes("can't reach database server")
  );
}

/** One process-wide circuit: any DB connection failure opens it for all callers (30s). Intentional — not per-model. */
export class DatabaseCircuitBreaker {
  private static state: CircuitState = CircuitState.CLOSED;
  private static nextAttemptAt: number = 0;
  private static readonly COOLDOWN_MS = 30000; // 30 seconds
  private static readonly DEFAULT_PROBE_TIMEOUT_MS = 5000;
  private static probeTimeoutMs: number = DatabaseCircuitBreaker.DEFAULT_PROBE_TIMEOUT_MS;

  /** Test-only hook to shorten probe timeout during unit testing. */
  static _setProbeTimeoutMsForTesting(ms: number): void {
    this.probeTimeoutMs = ms;
  }

  /** Test-only hook to restore default probe timeout. */
  static _resetProbeTimeoutMsForTesting(): void {
    this.probeTimeoutMs = this.DEFAULT_PROBE_TIMEOUT_MS;
  }

  static async execute<T>(operation: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // A probe request is already in flight. Fail other concurrent requests fast.
      throw new Error('CIRCUIT_OPEN'); 
    }

    let isProbe = false;
    if (this.state === CircuitState.OPEN) {
      if (now >= this.nextAttemptAt) {
        this.state = CircuitState.HALF_OPEN;
        isProbe = true;
        console.warn('Circuit breaker half-open: attempting probe request to DB.');
      } else {
        throw new Error('CIRCUIT_OPEN'); // Fail fast
      }
    }

    try {
      let result: T;
      if (isProbe) {
        // Bound probe execution so a hung operation cannot wedge the circuit in HALF_OPEN forever
        let timer: NodeJS.Timeout | undefined;
        try {
          const opPromise = operation();
          // Attach no-op catch so if the timeout wins the race, a subsequent late rejection
          // from opPromise does not trigger an unhandledRejection crash in server-starter.js.
          opPromise.catch(() => {});

          result = await Promise.race([
            opPromise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(new Error('Circuit breaker probe timed out (ETIMEDOUT)'));
              }, this.probeTimeoutMs);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      } else {
        result = await operation();
      }

      // If we succeed and were half-open, close the circuit
      if (this.state === CircuitState.HALF_OPEN) {
        this.state = CircuitState.CLOSED;
        console.log('Circuit breaker closed: DB connection restored.');
      }
      return result;
    } catch (error) {
      // If error is related to connection/initialization/timeouts
      if (isConnectionError(error)) {
        this.state = CircuitState.OPEN;
        this.nextAttemptAt = Date.now() + this.COOLDOWN_MS;
        console.error(`Circuit breaker open: DB connection failed. Cooldown until ${new Date(this.nextAttemptAt).toISOString()}`);
        throw new Error('CIRCUIT_OPEN');
      }
      // Non-connection error: the DB responded at all (query error, validation
      // error, etc.), so connectivity is proven. If we were probing, close the
      // circuit — otherwise it would stay stuck in HALF_OPEN forever, since
      // nothing else ever moves it out of that state.
      if (this.state === CircuitState.HALF_OPEN) {
        this.state = CircuitState.CLOSED;
        console.log('Circuit breaker closed: DB responded (non-connection error during probe).');
      }
      // Re-throw normal errors (e.g. data validation)
      throw error;
    }
  }

  static isOpen(): boolean {
    return this.state === CircuitState.OPEN && Date.now() < this.nextAttemptAt;
  }
}
