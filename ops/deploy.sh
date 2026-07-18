#!/bin/bash
# Deployment Script (Track A - Local Build & Upload)
# Required env vars (set in your local shell, NOT committed to git):
#   DEPLOY_HOST  — server IP or hostname, e.g. export DEPLOY_HOST=1.2.3.4
#   DEPLOY_KEY   — absolute path to your SSH private key, e.g. export DEPLOY_KEY=/path/to/key.pem
#   DATABASE_URL — live Postgres URL for pre-flight schema drift check (or set in .env)

set -euo pipefail

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
# Compare the live DB to schema.postgresql.prisma. A non-empty diff is OK only
# when migrate status reports pending migrations (happy path: new migration
# folder not yet applied). If the DB is migration-up-to-date but still drifts
# from the schema file, someone edited the schema without `migrate dev
# --create-only` — abort before upload so we never paper over that with db push.
echo "0. Pre-flight: checking live DB vs ${SCHEMA_PG} (prisma migrate diff)..."
set +e
npx prisma@6.19.3 migrate diff \
  --from-url "${DATABASE_URL}" \
  --to-schema-datamodel="${SCHEMA_PG}" \
  --exit-code
DIFF_EXIT=$?
set -e

if [ "${DIFF_EXIT}" -eq 0 ]; then
  echo "OK: live database matches ${SCHEMA_PG}"
elif [ "${DIFF_EXIT}" -eq 2 ]; then
  echo "WARN: live database differs from ${SCHEMA_PG}; checking for pending migrations..."
  set +e
  STATUS_OUT=$(npx prisma@6.19.3 migrate status --schema="${SCHEMA_PG}" 2>&1)
  STATUS_EXIT=$?
  set -e
  echo "${STATUS_OUT}"

  if echo "${STATUS_OUT}" | grep -qiE 'have not yet been applied'; then
    echo "OK: pending migrations will be applied on the server via prisma migrate deploy"
  else
    echo ""
    echo "ERROR: Live database does not match ${SCHEMA_PG}, and there are no pending"
    echo "migrations under prisma/migrations/ that would reconcile the drift."
    echo "This usually means the schema was edited without creating a migration."
    echo "Do NOT use db push. Generate a migration locally, commit it, then redeploy:"
    echo "  npx prisma migrate dev --create-only --schema=${SCHEMA_PG}"
    echo "(migrate status exit=${STATUS_EXIT}, migrate diff exit=${DIFF_EXIT})"
    exit 1
  fi
else
  echo "ERROR: prisma migrate diff failed (exit ${DIFF_EXIT}). Is DATABASE_URL reachable?"
  exit 1
fi

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

cat << 'EOF' > remote_deploy.sh
cd /home/ubuntu/cpr-calculator-platform
tar -xzf deploy_bundle.tar.gz
rm -f .next/standalone/.env*
cp -a .next/standalone/. .
cp .env .next/standalone/.env
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
pm2 stop cpr-platform || true
mv node_modules node_modules_old_$(date +%s) || true
npm ci --omit=dev
# INTENTIONAL: use migrate deploy, NOT db push.
# db push bypasses prisma/migrations and _prisma_migrations history, causing the
# live DB to drift from committed migrations and breaking future migrate deploy.
# migrate deploy only applies pending SQL from prisma/migrations/ (non-interactive).
# See fix/deploy-migration-safety — do not "helpfully" restore db push.
npx prisma@6.19.3 migrate deploy --schema=prisma/schema.postgresql.prisma
npx prisma@6.19.3 generate --schema=prisma/schema.postgresql.prisma
pm2 restart cpr-platform --update-env
EOF

scp -i "${DEPLOY_KEY}" -o StrictHostKeyChecking=accept-new remote_deploy.sh ubuntu@${DEPLOY_HOST}:/home/ubuntu/cpr-calculator-platform/remote_deploy.sh
ssh -i "${DEPLOY_KEY}" -o StrictHostKeyChecking=accept-new ubuntu@${DEPLOY_HOST} "bash /home/ubuntu/cpr-calculator-platform/remote_deploy.sh"

echo "Deployment complete!"
