# Agent Instructions — CPR Calculator Platform

## DEPLOY — One Command, ~2-3 Minutes

**To deploy to production, run ONE command:**

```powershell
.\ops\deploy.ps1
```

That's it. The script handles everything:
- Pre-flight checks (schema, DATABASE_URL)
- Sets production URL, builds, packages with tar
- Uploads via SCP, extracts on server, restarts PM2
- Restores local .env

**DO NOT:**
- Build manually step-by-step (wastes tokens and time)
- Use `Compress-Archive` / zip (Windows paths break on Linux)
- Use `npm ci` on the server (takes 3+ minutes unnecessarily)
- Use `pm2 restart --update-env` (stale env cache — always delete+start)

---

## Key Facts

| Item | Value |
|---|---|
| Server | `ubuntu@129.159.230.41` |
| SSH Key | `C:\Users\hiren\Downloads\ssh-key-2026-05-30 (1).key` |
| PM2 process | `cpr-platform` |
| Server app root | `/home/ubuntu/cpr-calculator-platform` |
| Deploy script (server) | `/home/ubuntu/deploy_extract.sh` |
| Database | PostgreSQL on localhost:5432 |
| Redis | localhost:6379 (on server only, not local) |

---

## Common Pitfalls (Read Before Touching Anything)

1. **`prisma/schema.prisma` must always be `provider = "postgresql"`**  
   `prisma-setup.js` silently switches it to `sqlite` locally. Always check before building.

2. **`NEXT_PUBLIC_BASE_URL` is inlined at BUILD time**  
   Must be `http://129.159.230.41` when building for production. `deploy.ps1` handles this automatically.

3. **Cookie `Secure` flag must NOT use `NODE_ENV === 'production'`**  
   The server runs plain HTTP. Use `NEXT_PUBLIC_BASE_URL.startsWith('https://')` instead.

4. **Redis errors during `npm run build` are normal** — no local Redis, it falls back to memory.

5. **After deploy, always restore `.env` `NEXT_PUBLIC_BASE_URL` to `http://localhost:3000`**  
   `deploy.ps1` does this automatically.

---

## Full Deploy Runbook

See [ops/DEPLOY_RUNBOOK.md](ops/DEPLOY_RUNBOOK.md) for detailed explanations.

---

## Cursor Cloud specific instructions

The deploy runbook above targets the Windows/PowerShell production workflow. For local development inside a Cursor Cloud Linux VM, use the notes below. Standard commands live in `package.json` (`dev`, `lint`, `test`, `build`) and `README.md`.

### Services
- **Next.js app** (the only service that must run): `npm run dev` → http://localhost:3000 (Turbopack). `/` redirects to `/calculate`. Health check: `GET /api/health`.
- **PostgreSQL 16** is installed locally as the dev database (matches the app's `postgresql` provider, so `prisma/schema.prisma` stays unmodified). It is NOT auto-started — start it each session with `sudo pg_ctlcluster 16 main start`. DB `cpr_pro`, credentials `postgres:postgres`, referenced by `DATABASE_URL` in `.env`.
- **Redis** is intentionally not run locally; the app falls back to an in-memory cache. `/api/health` reporting `redis: "disconnected"` is expected and not an error.

### Gotchas (non-obvious)
- **Never set `REDIS_URL=""` in `.env`.** An empty string fails the Zod `.url()` check in `src/config/env.ts` and crashes startup at the instrumentation hook. Omit the variable entirely (leave `CACHE_PROVIDER="memory"`) to use the in-memory fallback.
- **Do NOT run `node prisma-setup.js` in this environment.** When `DATABASE_URL` isn't a reachable `postgresql://` URL it rewrites `prisma/schema.prisma`'s provider to `sqlite` (tracked-file churn + the pitfall #1 above). Since local Postgres is configured, just use `npx prisma db push` (only needed on a fresh/empty DB) and `npx prisma generate`.
- `.env` is git-ignored and already configured for the local Postgres + memory-cache setup; it persists across sessions.
- BTST/overnight endpoints are gated to the 15:10–15:25 IST window; `.env` sets `BTST_BYPASS_WINDOW="true"` so they can be tested any time.
- Live market data (scanner, signals) needs outbound internet to Yahoo Finance; set `MARKET_DATA_MODE="mock"` to run fully offline. The manual CPR calculator (`/calculate`, `POST /api/cpr/calculate`) takes manual OHLC input and needs no market data.

### Lint / test / build
- Lint: `npm run lint` (currently clean except pre-existing unused-var warnings).
- Tests: `npm test` (Node native runner, 157 unit tests).
- Build: `npm run build` (production build; dev uses `npm run dev`).
