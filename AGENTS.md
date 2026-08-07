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
- **NEVER run `npm run build` directly on the Oracle server via SSH.** The server has limited memory and the build will freeze, crash, or take 10+ minutes. ALWAYS use `.\ops\deploy.ps1` to build locally and push the artifacts.
- **Direct read-only SSH diagnostics (reading logs, querying Redis keys, and checking database records/PM2 status) are fully authorized** for troubleshooting and root-cause analysis. However, do not deploy code changes, test unverified scripts, or run manual database migrations directly on the server; prepare all patches locally and deploy using `.\ops\deploy.ps1`.
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

## Memory (Oracle Free Tier — ~1 GB RAM)

Production runs on a **956 MB** VM. Next.js standalone alone uses ~330–470 MB RSS at steady state; **55–70% RAM usage is normal**.

**Permanent safeguards (do not remove):**
- `ops/ecosystem.config.cjs` — PM2 starts with `--max-old-space-size=384` and `max_memory_restart: 550M` (450M caused mid-scan restart loops; heap stays 384)
- `ops/mem_watchdog.sh` — crontab every 5 min: **outside** NSE cash session (09:15–15:30 IST) flushes Redis at 75% RAM and flush+restart at 85%; **during** market hours skips FLUSHDB (preserves `cron_done` / unlock rate-limit keys) and may still restart PM2 at 85%
- Cache layer stores data in **Redis only** when connected (no duplicate L1 in Node heap)
- Cron jobs call `purgeInProcessCaches()` after auto-scan and BTST alert

### Cache trade-off (documented — not a silent regression)

When Redis is connected, `CacheService.set()` writes **Redis only**. The in-process LRU is populated only when Redis is down or a Redis write fails.

This **reverses** the earlier always-write-L1 warm-cache behavior (added to prevent thundering-herd DB hits after Redis disconnects). On the 1 GB Oracle VM, mirroring ~700 keys into Node heap permanently cost more RAM than we could afford (~90% host usage).

**Known failure mode:** Outside market hours, `mem_watchdog` may flush Redis at 75% RAM → L1 was never warm either → next scan/API batch miss-storms upstream/DB → short CPU/RAM spike. During 09:15–15:30 IST, FLUSHDB is skipped so cron claims / unlock rate limits survive. Accepted: a transient miss burst after an off-hours flush is cheaper than carrying 2× cache residency forever.

**Implication for new features:** do **not** store durable product state (direction hysteresis, alert claims, cooldowns) in Redis alone — it is intentionally disposable under memory pressure. Prefer Postgres (same pattern as `breakoutAlertState` / `btstAlertState`) or a small in-process Map that is explicitly OK to lose on PM2 restart.

**Check memory:** authenticated `GET /api/health` → `memory.process.rssMb` and `memory.l1.size`

**If RAM stays >85% after deploy:** confirm `pm2 show cpr-platform` lists `max memory restart: 576716800` (550M).

---

## Common Pitfalls (Read Before Touching Anything)

1. **`prisma/schema.prisma` must always be `provider = "postgresql"`**  
   `prisma-setup.js` silently switches it to `sqlite` locally. Always check before building.

2. **`NEXT_PUBLIC_BASE_URL` is inlined at BUILD time**  
   Production build must use `https://129-159-230-41.nip.io` (see `ops/deploy.ps1`). Prefer that HTTPS URL in the browser — not bare `http://IP` — so Secure session cookies stick.

3. **Cookie `Secure` flag must NOT use `NODE_ENV === 'production'`**  
   Use request HTTPS / `X-Forwarded-Proto` / `NEXT_PUBLIC_BASE_URL.startsWith('https://')` (`src/lib/auth-cookie.ts`). Nginx TLS terminates at nip.io; Node still listens on localhost HTTP behind the proxy.

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
- Tests: `npm test` (Node native runner, 485 unit tests; 41 fail in sandboxes without a generated Prisma client — run `prisma generate` first).
- Build: `npm run build` (production build; dev uses `npm run dev`).

---

## Accepted Risk / Audit Exceptions

### yahoo-finance2 → @modelcontextprotocol/sdk → @hono/node-server (moderate)
- Advisory: GHSA-frvp-7c67-39w9 — path traversal in `serve-static` via encoded backslash (`%5C`)
- Windows-specific attack vector; deploy target is Oracle Cloud Linux via PM2 — not exposed
- Fix requires `yahoo-finance2` downgrade (breaking change, would affect the fallback data source)
- Reviewed: 2026-07-31. Decision: accept, no action. Revisit if yahoo-finance2 ships a non-breaking patch.

### eslint / eslint-config-next / @eslint/eslintrc chain (high) + transitive minimatch/brace-expansion
- Advisory: GHSA-mh99-v99m-4gvg (brace-expansion DoS) and related eslint-config-array/eslintrc chain
- All devDependencies — no runtime/production exposure
- Fix requires eslint-config-next major downgrade (breaking, affects lint tooling only)
- Reviewed: 2026-07-31. Decision: accept, no action.
