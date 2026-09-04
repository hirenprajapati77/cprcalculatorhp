#!/usr/bin/env pwsh
# =============================================================
# CPR Platform — One-Command Deploy Script
# Usage: .\ops\deploy.ps1
# Total time: ~2-3 minutes
# =============================================================

$ErrorActionPreference = "Stop"

$SSH_KEY          = if ($env:DEPLOY_SSH_KEY) { $env:DEPLOY_SSH_KEY } else { "C:\Users\hiren\Downloads\ssh-key-2026-05-30 (1).key" }
$SERVER           = if ($env:DEPLOY_SERVER) { $env:DEPLOY_SERVER } else { "ubuntu@129.159.230.41" }
$PROD_URL         = if ($env:DEPLOY_PROD_URL) { $env:DEPLOY_PROD_URL } else { "https://129-159-230-41.nip.io" }
$STRICT_HOST_KEY  = if ($env:DEPLOY_STRICT_HOST_KEY) { $env:DEPLOY_STRICT_HOST_KEY } else { "accept-new" }
$LOCAL_URL        = "http://localhost:3000"
$ENV_FILE         = ".env"

function Log($msg) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $msg" -ForegroundColor Cyan }
function Ok($msg)  { Write-Host "[OK] $msg" -ForegroundColor Green }
function Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

# ── 1. PRE-FLIGHT CHECKS ─────────────────────────────────────
Log "Running pre-flight checks..."

$schema = Get-Content "prisma\schema.prisma" -Raw
if ($schema -notmatch 'provider\s*=\s*"postgresql"') {
    Err "prisma/schema.prisma has wrong provider. Expected postgresql. Run: (Get-Content prisma\schema.prisma) -replace 'provider = ""sqlite""', 'provider = ""postgresql""' | Set-Content prisma\schema.prisma"
}
Ok "schema.prisma = postgresql"

$dbUrl = (Get-Content $ENV_FILE | Where-Object { $_ -match "^DATABASE_URL" })
if ($dbUrl -notmatch "postgresql://") {
    Err "DATABASE_URL in .env does not start with postgresql://"
}
Ok "DATABASE_URL = postgresql"

$untrackedMigrations = & git status --porcelain prisma/migrations/ 2>&1
if ($untrackedMigrations) {
    Err "You have untracked database migrations! Please add, commit, and push them to Git before deploying. Git output:`n$untrackedMigrations"
}
Ok "no untracked database migrations"

if (-not (Test-Path ".env.server")) {
    Err ".env.server missing. Create it from production secrets before deploy (never wipe server .env with a partial file)."
}
$requiredServerEnv = @(
    "DATABASE_URL",
    "REDIS_URL",
    "APP_ACCESS_TOKEN",
    "CRON_SECRET",
    "NEXT_PUBLIC_BASE_URL",
    "TOKEN_ENCRYPTION_KEY",
    "FYERS_APP_ID",
    "FYERS_SECRET_ID"
)
$serverEnvLines = Get-Content ".env.server"
foreach ($key in $requiredServerEnv) {
    $hit = $serverEnvLines | Where-Object { $_ -match "^$key=" -and $_ -notmatch "^$key=\s*$" -and $_ -notmatch "^$key=`"`"" }
    if (-not $hit) {
        Err ".env.server is missing required key: $key"
    }
}
Ok ".env.server has required keys (will MERGE into server .env, not overwrite)"

# ── 2. SET PRODUCTION URL ────────────────────────────────────
Log "Setting NEXT_PUBLIC_BASE_URL to production..."
(Get-Content $ENV_FILE) -replace "NEXT_PUBLIC_BASE_URL=.*", "NEXT_PUBLIC_BASE_URL=`"$PROD_URL`"" | Set-Content $ENV_FILE
Ok "NEXT_PUBLIC_BASE_URL = $PROD_URL"

# ── 3. BUILD ─────────────────────────────────────────────────
# Prisma client (+ debian-openssl-3.0.x engine) is generated locally here.
# Server deploy_extract.sh must NOT run `prisma generate` (OOM on 1GB VM).
Log "Installing dependencies..."
$ErrorActionPreference = "Continue"
$build = & npm install --prefer-offline --no-audit --no-fund 2>&1
$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
    Log "Generating Prisma client (native + debian-openssl-3.0.x for prod)..."
    $build = & node node_modules/prisma/build/index.js generate 2>&1
    $exitCode = $LASTEXITCODE
}
if ($exitCode -eq 0) {
    Log "Verifying TypeScript types (npm run typecheck)..."
    $build = & npm run typecheck 2>&1
    $exitCode = $LASTEXITCODE
}
if ($exitCode -eq 0) {
    Log "Building Next.js (this takes ~1-2 min)..."
    $build = & npm run build 2>&1
    $exitCode = $LASTEXITCODE
}
$ErrorActionPreference = "Stop"
if ($exitCode -ne 0) {
    # Restore .env before failing
    (Get-Content $ENV_FILE) -replace "NEXT_PUBLIC_BASE_URL=.*", "NEXT_PUBLIC_BASE_URL=`"$LOCAL_URL`"" | Set-Content $ENV_FILE
    Err "Build failed with exit code $exitCode. Restored .env. Check output above."
}
Ok "Build complete"

# ── 4. PACKAGE ───────────────────────────────────────────────
Log "Packaging standalone + static + public..."
tar -czf deploy_standalone.tar.gz -C .next/standalone .
tar -czf deploy_static.tar.gz -C .next/static .
tar -czf deploy_public.tar.gz public
tar -czf deploy_prisma.tar.gz prisma
$s1 = [math]::Round((Get-Item deploy_standalone.tar.gz).Length / 1MB, 1)
$s2 = [math]::Round((Get-Item deploy_static.tar.gz).Length / 1MB, 1)
$s3 = [math]::Round((Get-Item deploy_prisma.tar.gz).Length / 1MB, 1)
$s4 = [math]::Round((Get-Item deploy_public.tar.gz).Length / 1MB, 1)
Ok "Packaged: standalone=${s1}MB  static=${s2}MB  prisma=${s3}MB  public=${s4}MB"

# ── 5. RESTORE LOCAL .env ────────────────────────────────────
Log "Restoring local .env..."
(Get-Content $ENV_FILE) -replace "NEXT_PUBLIC_BASE_URL=.*", "NEXT_PUBLIC_BASE_URL=`"$LOCAL_URL`"" | Set-Content $ENV_FILE
Ok "NEXT_PUBLIC_BASE_URL restored to $LOCAL_URL"

# ── 6. UPLOAD ────────────────────────────────────────────────
Log "Uploading to server (~15-20s)..."
scp -i $SSH_KEY -o StrictHostKeyChecking=$STRICT_HOST_KEY deploy_standalone.tar.gz deploy_static.tar.gz deploy_public.tar.gz deploy_prisma.tar.gz ops/deploy_extract.sh ops/merge_env.sh ops/ecosystem.config.cjs ops/mem_watchdog.sh "${SERVER}:/home/ubuntu/"
if ($LASTEXITCODE -ne 0) { Err "SCP upload failed" }

Log "Merging .env.server into production .env (keeps server-only keys)..."
scp -i $SSH_KEY -o StrictHostKeyChecking=$STRICT_HOST_KEY .env.server "${SERVER}:/home/ubuntu/cpr.env.server"
if ($LASTEXITCODE -ne 0) { Err "SCP env upload failed" }

ssh -i $SSH_KEY -o StrictHostKeyChecking=$STRICT_HOST_KEY $SERVER "sed -i 's/\r$//' /home/ubuntu/merge_env.sh && bash /home/ubuntu/merge_env.sh"
if ($LASTEXITCODE -ne 0) { Err "Server .env merge failed" }

Ok "Upload complete"

# ── 7. EXTRACT + RESTART ON SERVER ───────────────────────────
Log "Extracting and restarting PM2 on server..."
ssh -i $SSH_KEY -o StrictHostKeyChecking=$STRICT_HOST_KEY $SERVER "sed -i 's/\r$//' /home/ubuntu/deploy_extract.sh /home/ubuntu/mem_watchdog.sh && chmod +x /home/ubuntu/mem_watchdog.sh && bash /home/ubuntu/deploy_extract.sh"
if ($LASTEXITCODE -ne 0) { Err "Server deploy script failed" }

Log "Verifying PM2 memory limit on server..."
$pm2Max = (ssh -i $SSH_KEY -o StrictHostKeyChecking=$STRICT_HOST_KEY $SERVER 'pm2 show cpr-platform 2>/dev/null | grep -E "max.*memory.*restart" | sed -E "s/[^0-9]//g"').Trim()
if ($pm2Max -ne "681574400") {
    Err "PM2 max_memory_restart is '$pm2Max' (expected 681574400 / 650M). Check /home/ubuntu/ecosystem.config.cjs"
}
Ok "PM2 max_memory_restart = 650M (681574400)"

# ── 8. CLEANUP LOCAL TARBALLS ────────────────────────────────
Remove-Item -Force deploy_standalone.tar.gz, deploy_static.tar.gz, deploy_public.tar.gz, deploy_prisma.tar.gz -ErrorAction SilentlyContinue
Ok "Local tarballs cleaned up"

# ── 9. DONE ──────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  DEPLOY COMPLETE" -ForegroundColor Green
Write-Host "  $PROD_URL" -ForegroundColor Green
Write-Host "  (use HTTPS nip.io — not bare http://IP — for Secure cookies)" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
