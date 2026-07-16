#!/usr/bin/env pwsh
# =============================================================
# CPR Platform — One-Command Deploy Script
# Usage: .\ops\deploy.ps1
# Total time: ~2-3 minutes
# =============================================================

$ErrorActionPreference = "Stop"

$SSH_KEY   = "C:\Users\hiren\Downloads\ssh-key-2026-05-30 (1).key"
$SERVER    = "ubuntu@129.159.230.41"
$PROD_URL  = "http://129.159.230.41"
$LOCAL_URL = "http://localhost:3000"
$ENV_FILE  = ".env"

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

# ── 2. SET PRODUCTION URL ────────────────────────────────────
Log "Setting NEXT_PUBLIC_BASE_URL to production..."
(Get-Content $ENV_FILE) -replace "NEXT_PUBLIC_BASE_URL=.*", "NEXT_PUBLIC_BASE_URL=`"$PROD_URL`"" | Set-Content $ENV_FILE
Ok "NEXT_PUBLIC_BASE_URL = $PROD_URL"

# ── 3. BUILD ─────────────────────────────────────────────────
Log "Building Next.js (this takes ~1-2 min)..."
$ErrorActionPreference = "Continue"
$build = & npm run build 2>&1
$exitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($exitCode -ne 0) {
    # Restore .env before failing
    (Get-Content $ENV_FILE) -replace "NEXT_PUBLIC_BASE_URL=.*", "NEXT_PUBLIC_BASE_URL=`"$LOCAL_URL`"" | Set-Content $ENV_FILE
    Err "Build failed with exit code $exitCode. Restored .env. Check output above."
}
Ok "Build complete"

# ── 4. PACKAGE ───────────────────────────────────────────────
Log "Packaging standalone + static..."
tar -czf deploy_standalone.tar.gz -C .next/standalone .
tar -czf deploy_static.tar.gz -C .next/static .
tar -czf deploy_prisma.tar.gz prisma/
$s1 = [math]::Round((Get-Item deploy_standalone.tar.gz).Length / 1MB, 1)
$s2 = [math]::Round((Get-Item deploy_static.tar.gz).Length / 1MB, 1)
$s3 = [math]::Round((Get-Item deploy_prisma.tar.gz).Length / 1MB, 1)
Ok "Packaged: standalone=${s1}MB  static=${s2}MB  prisma=${s3}MB"

# ── 5. RESTORE LOCAL .env ────────────────────────────────────
Log "Restoring local .env..."
(Get-Content $ENV_FILE) -replace "NEXT_PUBLIC_BASE_URL=.*", "NEXT_PUBLIC_BASE_URL=`"$LOCAL_URL`"" | Set-Content $ENV_FILE
Ok "NEXT_PUBLIC_BASE_URL restored to $LOCAL_URL"

# ── 6. UPLOAD ────────────────────────────────────────────────
Log "Uploading to server (~15-20s)..."
scp -i $SSH_KEY -o StrictHostKeyChecking=no deploy_standalone.tar.gz deploy_static.tar.gz deploy_prisma.tar.gz "${SERVER}:/home/ubuntu/"
if ($LASTEXITCODE -ne 0) { Err "SCP upload failed" }
Ok "Upload complete"

# ── 7. EXTRACT + RESTART ON SERVER ───────────────────────────
Log "Extracting and restarting PM2 on server..."
ssh -i $SSH_KEY -o StrictHostKeyChecking=no $SERVER "bash /home/ubuntu/deploy_extract.sh"
if ($LASTEXITCODE -ne 0) { Err "Server deploy script failed" }

# ── 8. CLEANUP LOCAL TARBALLS ────────────────────────────────
Remove-Item -Force deploy_standalone.tar.gz, deploy_static.tar.gz, deploy_prisma.tar.gz -ErrorAction SilentlyContinue
Ok "Local tarballs cleaned up"

# ── 9. DONE ──────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  DEPLOY COMPLETE" -ForegroundColor Green
Write-Host "  http://129.159.230.41" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
