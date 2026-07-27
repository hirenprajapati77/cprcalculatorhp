/** Preload for unit/integration tests — must run before `@/config/env` is imported. */
process.env.NODE_ENV = 'test';
process.env.APP_ACCESS_TOKEN = 'test-token-123';

