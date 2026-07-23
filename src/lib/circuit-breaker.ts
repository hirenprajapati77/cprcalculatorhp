export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN',     // DB is down, fail fast
  HALF_OPEN = 'HALF_OPEN' // Probe phase
}

/** One process-wide circuit: any DB connection failure opens it for all callers (30s). Intentional — not per-model. */
export class DatabaseCircuitBreaker {
  private static state: CircuitState = CircuitState.CLOSED;
  private static nextAttemptAt: number = 0;
  private static readonly COOLDOWN_MS = 30000; // 30 seconds

  static async execute<T>(operation: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // A probe request is already in flight. Fail other concurrent requests fast.
      throw new Error('CIRCUIT_OPEN'); 
    }

    if (this.state === CircuitState.OPEN) {
      if (now >= this.nextAttemptAt) {
        this.state = CircuitState.HALF_OPEN;
        console.warn('Circuit breaker half-open: attempting probe request to DB.');
      } else {
        throw new Error('CIRCUIT_OPEN'); // Fail fast
      }
    }

    try {
      const result = await operation();
      // If we succeed and were half-open, close the circuit
      if (this.state === CircuitState.HALF_OPEN) {
        this.state = CircuitState.CLOSED;
        console.log('Circuit breaker closed: DB connection restored.');
      }
      return result;
    } catch (error) {
      // If error is related to connection/initialization
      if (
        error instanceof Error && 
        (error.name === 'PrismaClientInitializationError' || 
         error.message.includes('ECONNREFUSED'))
      ) {
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
