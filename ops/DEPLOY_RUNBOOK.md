# CPR Platform — Deployment Runbook

> **Server:** `ubuntu@129.159.230.41`  
> **SSH Key:** `C:\Users\hiren\Downloads\ssh-key-2026-05-30 (1).key`  
> **App Root on Server:** `/home/ubuntu/cpr-calculator-platform`  
> **PM2 Process Name:** `cpr-platform`

---

## ⚠️ Critical Pre-Deploy Checklist

Before every build, verify these **3 things** or you will break production:

| Check | Correct Value | How to verify |
|---|---|---|
| `prisma/schema.prisma` provider | `"postgresql"` | `grep provider prisma/schema.prisma` |
| `.env` NEXT_PUBLIC_BASE_URL | `"http://129.159.230.41"` | `grep NEXT_PUBLIC .env` |
| `.env` DATABASE_URL | starts with `postgresql://` | `grep DATABASE_URL .env` |

> **Why `schema.prisma` matters:** Running `node prisma-setup.js` locally switches provider to `sqlite` (because local PostgreSQL is off). If you deploy a sqlite-configured Prisma client to the PostgreSQL server, the DB crashes. Always verify before building.

---

## Step-by-Step Deploy

### Step 1 — Set Production URL in local `.env`

```env
NEXT_PUBLIC_BASE_URL="http://129.159.230.41"
```

### Step 2 — Build

```powershell
npm run build
```

Expected: `✓ Generating static pages (42/42)` — Redis errors during build are normal (no local Redis), they are non-fatal.

### Step 3 — Package with tar (NOT zip — zip has Windows path issues on Linux)

```powershell
tar -czf deploy_standalone.tar.gz -C .next/standalone .
tar -czf deploy_static.tar.gz -C .next/static .
```

Expected sizes: standalone ~32MB, static ~0.7MB

### Step 4 — Upload to server

```powershell
scp -i "C:\Users\hiren\Downloads\ssh-key-2026-05-30 (1).key" -o StrictHostKeyChecking=no `
    deploy_standalone.tar.gz deploy_static.tar.gz `
    ubuntu@129.159.230.41:/home/ubuntu/
```

Expected: completes in ~15-20 seconds.

### Step 5 — Run deploy script on server

```powershell
ssh -i "C:\Users\hiren\Downloads\ssh-key-2026-05-30 (1).key" -o StrictHostKeyChecking=no `
    ubuntu@129.159.230.41 "bash /home/ubuntu/deploy_extract.sh"
```

The `deploy_extract.sh` script (committed at `ops/deploy_extract.sh`) does:
1. Replaces `.next/standalone` with the new build
2. Places static assets into `.next/standalone/.next/static`
3. Copies `.env` into standalone directory
4. Deletes and recreates the PM2 process (ensures env vars are freshly loaded)
5. Saves PM2 state
6. Runs a health check after 5s startup

Expected output ends with:
```
DB: healthy
Env: production
```

### Step 6 — Restore local `.env`

```env
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
```

### Step 7 — Commit and push

```powershell
git add -A
git commit -m "deploy: <description of what changed>"
git push origin main
```

---

## Verify After Deploy

```powershell
# Health check
ssh -i "C:\Users\hiren\Downloads\ssh-key-2026-05-30 (1).key" -o StrictHostKeyChecking=no ubuntu@129.159.230.41 "curl -s http://localhost:3000/api/health"

# PM2 status
ssh -i "C:\Users\hiren\Downloads\ssh-key-2026-05-30 (1).key" -o StrictHostKeyChecking=no ubuntu@129.159.230.41 "pm2 list"

# Last 50 PM2 logs
ssh -i "C:\Users\hiren\Downloads\ssh-key-2026-05-30 (1).key" -o StrictHostKeyChecking=no ubuntu@129.159.230.41 "pm2 logs cpr-platform --lines 50 --nostream"
```

---

## Common Errors and Fixes

| Error | Cause | Fix |
|---|---|---|
| `the URL must start with protocol file:` | `schema.prisma` has `provider = "sqlite"` | Change to `"postgresql"`, run `npx prisma generate`, rebuild |
| `Invalid CSRF state` on Fyers login | `oauth_state` cookie set with `Secure:true` on HTTP | Fixed in code — cookie uses HTTPS check not NODE_ENV |
| `NEXT_PUBLIC_BASE_URL` shows `localhost` in production | PM2 env snapshot is stale | Always use `pm2 delete` + `pm2 start` not `pm2 restart` — deploy_extract.sh handles this |
| SCP zip extraction warning about backslashes | Windows Compress-Archive uses backslash paths | Use `tar` instead of zip for cross-platform packaging |
| Build fails with `EPERM rename` on Prisma | Dev server is running and locking the DLL | Kill dev server before building |

---

## Full Deploy Time Reference

| Step | Time |
|---|---|
| `npm run build` | ~1-2 min |
| `tar` packaging | ~10s |
| `scp` upload | ~15-20s |
| Server extract + PM2 restart | ~10s |
| **Total** | **~2-3 minutes** |

---

## Notes for AI Agents

- Always use `tar` not `zip` — zip created on Windows has backslash paths that fail on Linux `unzip`
- Always `pm2 delete` + `pm2 start` — not `pm2 restart --update-env` (PM2 caches env at process creation)
- The `.env` file must be copied into `.next/standalone/.env` — Next.js standalone reads it from CWD not project root
- `NEXT_PUBLIC_*` vars are statically inlined at build time — set them correctly before `npm run build`
- `NODE_ENV` does NOT control cookie security — check `NEXT_PUBLIC_BASE_URL` for `https://` instead
- `prisma-setup.js` silently switches schema to sqlite if local PostgreSQL is unreachable — always verify `schema.prisma` before building
- After every deploy restore `.env` `NEXT_PUBLIC_BASE_URL` back to `http://localhost:3000` for local dev
