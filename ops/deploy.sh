#!/bin/bash
# Deployment Script (Track A - Local Build & Upload)
# Required env vars (set in your local shell, NOT committed to git):
#   DEPLOY_HOST  — server IP or hostname, e.g. export DEPLOY_HOST=1.2.3.4
#   DEPLOY_KEY   — absolute path to your SSH private key, e.g. export DEPLOY_KEY=/path/to/key.pem
#   DATABASE_URL — live Postgres URL for pre-flight schema drift check (or set in .env)
#   SHADOW_DATABASE_URL — optional empty Postgres DB for migrations↔schema diff;
#                         if unset, pre-flight tries to CREATE DATABASE prisma_deploy_shadow
#
# Local validation without production: ./ops/deploy-dryrun.sh  (see ops/DEPLOY_DRYRUN.md)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/lib/deploy-preflight.sh
source "${SCRIPT_DIR}/lib/deploy-preflight.sh"

# ── Guard: fail loudly if credentials are not set ─────────────────────────────
: "${DEPLOY_HOST:?ERROR: DEPLOY_HOST is not set. Export it before running deploy.sh}"
: "${DEPLOY_KEY:?ERROR: DEPLOY_KEY is not set. Export it before running deploy.sh}"

SSH_OPTS="-i \"${DEPLOY_KEY}\" -o StrictHostKeyChecking=accept-new"

SCHEMA_PG="prisma/schema.postgresql.prisma"

# Load DATABASE_URL from .env when not already exported (must be the live Postgres URL).
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  export DATABASE_URL
fi
: "${DATABASE_URL:?ERROR: DATABASE_URL is not set. Export the live Postgres URL (or put it in .env) before deploying.}"

# ── 0. Pre-flight: block schema edits that have no migration ──────────────────
echo "0. Pre-flight (before upload)..."
run_deploy_preflight

echo "1. Installing dependencies & generating Prisma client locally..."
npm ci
DATABASE_URL="postgresql://dummy" npx prisma generate --schema=prisma/schema.postgresql.prisma

echo "2. Building locally..."
DATABASE_URL="postgresql://dummy" npm run build

echo "3. Compressing build bundle (standalone, static, public, prisma)..."
# Compress only the required files for Next.js standalone mode
tar -czf deploy_bundle.tar.gz .next/standalone .next/static public prisma package.json package-lock.json

echo "4. Uploading to ${DEPLOY_HOST}..."
scp -i "${DEPLOY_KEY}" -o StrictHostKeyChecking=accept-new deploy_bundle.tar.gz ubuntu@${DEPLOY_HOST}:/home/ubuntu/cpr-calculator-platform/deploy_bundle.tar.gz

cat << EOF > remote_deploy.sh
cd /home/ubuntu/cpr-calculator-platform
tar -xzf deploy_bundle.tar.gz
rm -f .next/standalone/.env*
cp -a .next/standalone/. .
cp .env .next/standalone/.env
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
mv node_modules node_modules_old_\$(date +%s) || true
npm ci --omit=dev
# INTENTIONAL: use migrate deploy, NOT db push.
# db push bypasses prisma/migrations and _prisma_migrations history, causing the
# live DB to drift from committed migrations and breaking future migrate deploy.
# migrate deploy only applies pending SQL from prisma/migrations/ (non-interactive).
# See fix/deploy-migration-safety — do not "helpfully" restore db push.
npx prisma@${PRISMA_VERSION} migrate deploy --schema=prisma/schema.postgresql.prisma
npx prisma@${PRISMA_VERSION} generate --schema=prisma/schema.postgresql.prisma
# Rulebook: never pm2 restart --update-env (stale env cache) — always delete + start.
pm2 delete cpr-platform || true
pm2 start server.js --name cpr-platform
pm2 save
EOF

scp -i "${DEPLOY_KEY}" -o StrictHostKeyChecking=accept-new remote_deploy.sh ubuntu@${DEPLOY_HOST}:/home/ubuntu/cpr-calculator-platform/remote_deploy.sh
ssh -i "${DEPLOY_KEY}" -o StrictHostKeyChecking=accept-new ubuntu@${DEPLOY_HOST} "bash /home/ubuntu/cpr-calculator-platform/remote_deploy.sh"

echo "Deployment complete!"
