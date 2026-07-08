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
