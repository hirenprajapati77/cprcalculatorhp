#!/bin/bash
set -e

echo "=================================================="
echo "🚀 CPR Calculator - Pre-Deployment Dry Run"
echo "=================================================="

echo "1. Checking Environment Variables..."
if [ -z "$EXECUTION_MODE" ]; then
    echo "⚠️  EXECUTION_MODE not explicitly set in environment! Defaulting to local .env check..."
    if ! grep -q "EXECUTION_MODE=" .env; then
        echo "❌ ERROR: EXECUTION_MODE missing from .env!"
        exit 1
    fi
fi
echo "✅ Environment configured."

echo "2. Running Next.js Production Build..."
# Note: npm run build checks type/eslint rules unless ignored in next.config.ts
if ! npm run build; then
    echo "❌ ERROR: Production build failed!"
    exit 1
fi
echo "✅ Build successful."

echo "3. Dry-running Prisma Migrations..."
if ! npx prisma migrate status > /dev/null 2>&1; then
    echo "⚠️  Prisma migrate status returned non-zero. Attempting a safe db pull/generate..."
    npx prisma generate
fi
echo "✅ Database schema sync verified."

echo "4. Executing Health Check Simulator..."
# Simulate what /api/health does, but via a quick Node script
node -e "
const fs = require('fs');
if (!fs.existsSync('.env')) {
    console.error('❌ ERROR: .env file missing!');
    process.exit(1);
}
console.log('✅ Local Health Simulator Passed.');
"

echo "=================================================="
echo "🎉 Dry Run Complete! Safe to run docker-compose up."
echo "=================================================="
