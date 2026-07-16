#!/bin/bash
set -e

APP=/home/ubuntu/cpr-calculator-platform

echo "=== Replacing standalone ==="
rm -rf $APP/.next/standalone
mkdir -p $APP/.next/standalone
tar -xzf /home/ubuntu/deploy_standalone.tar.gz -C $APP/.next/standalone

echo "=== Placing static assets ==="
mkdir -p $APP/.next/standalone/.next/static
tar -xzf /home/ubuntu/deploy_static.tar.gz -C $APP/.next/standalone/.next/static

echo "=== Extracting Prisma schema & migrations ==="
tar -xzf /home/ubuntu/deploy_prisma.tar.gz -C $APP/

echo "=== Copying .env into standalone ==="
cp $APP/.env $APP/.next/standalone/.env

echo "=== Checking DATABASE_URL in .env ==="
grep "DATABASE_URL" $APP/.next/standalone/.env | head -1

echo "=== Checking NEXT_PUBLIC_BASE_URL ==="
grep "NEXT_PUBLIC_BASE_URL" $APP/.next/standalone/.env | head -1

echo "=== Running Database Migrations ==="
cd $APP
npx prisma migrate deploy

echo "=== Restarting PM2 fresh ==="
pm2 delete cpr-platform 2>/dev/null || true
cd $APP/.next/standalone
pm2 start server.js --name cpr-platform
pm2 save

echo "=== Cleanup ==="
rm -f /home/ubuntu/deploy_standalone.tar.gz /home/ubuntu/deploy_static.tar.gz /home/ubuntu/deploy_prisma.tar.gz
rm -f /home/ubuntu/deploy_standalone.zip /home/ubuntu/deploy_static.zip /home/ubuntu/deploy_prisma.zip

echo "=== PM2 status ==="
pm2 list

echo "=== Health check (waiting 5s for startup) ==="
sleep 5
curl -s http://localhost:3000/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('DB:', d['checks']['database']); print('Env:', d['environment']); print('BaseURL from env:', d.get('baseUrl','N/A'))" 2>/dev/null || curl -s http://localhost:3000/api/health | head -c 500
