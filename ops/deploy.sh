#!/bin/bash
# Deployment Script (Track A - Local Build & Upload)
# Required env vars (set in your local shell, NOT committed to git):
#   DEPLOY_HOST  — server IP or hostname, e.g. export DEPLOY_HOST=1.2.3.4
#   DEPLOY_KEY   — absolute path to your SSH private key, e.g. export DEPLOY_KEY=/path/to/key.pem

set -euo pipefail

# ── Guard: fail loudly if credentials are not set ─────────────────────────────
: "${DEPLOY_HOST:?ERROR: DEPLOY_HOST is not set. Export it before running deploy.sh}"
: "${DEPLOY_KEY:?ERROR: DEPLOY_KEY is not set. Export it before running deploy.sh}"

SSH_OPTS="-i \"${DEPLOY_KEY}\" -o StrictHostKeyChecking=accept-new"

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
npx prisma@6.19.3 db push --schema=prisma/schema.postgresql.prisma
npx prisma@6.19.3 generate --schema=prisma/schema.postgresql.prisma
pm2 restart cpr-platform --update-env
EOF

scp -i "${DEPLOY_KEY}" -o StrictHostKeyChecking=accept-new remote_deploy.sh ubuntu@${DEPLOY_HOST}:/home/ubuntu/cpr-calculator-platform/remote_deploy.sh
ssh -i "${DEPLOY_KEY}" -o StrictHostKeyChecking=accept-new ubuntu@${DEPLOY_HOST} "bash /home/ubuntu/cpr-calculator-platform/remote_deploy.sh"

echo "Deployment complete!"
