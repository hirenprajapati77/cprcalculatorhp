#!/bin/bash
# Deployment Script (Track A - Local Build & Upload)

echo "1. Installing dependencies & generating Prisma client locally..."
npm ci
npx prisma generate

echo "2. Building locally..."
npm run build

echo "3. Compressing build bundle (standalone, static, public, prisma)..."
# Compress only the required files for Next.js standalone mode
tar -czf deploy_bundle.tar.gz .next/standalone .next/static public prisma package.json package-lock.json

echo "4. Uploading to Oracle VM..."
scp -i "C:\Users\hiren\Downloads\ssh-key-2026-05-30 (1).key" -o StrictHostKeyChecking=no deploy_bundle.tar.gz ubuntu@129.159.230.41:/home/ubuntu/cpr-calculator-platform/deploy_bundle.tar.gz

echo "5. Extracting and deploying on VM..."
ssh -i "C:\Users\hiren\Downloads\ssh-key-2026-05-30 (1).key" -o StrictHostKeyChecking=no ubuntu@129.159.230.41 "cd /home/ubuntu/cpr-calculator-platform && \
  tar -xzf deploy_bundle.tar.gz && \
  rm -f .next/standalone/.env* && \
  cp -a .next/standalone/. . && \
  cp .env .next/standalone/.env && \
  cp -r .next/static .next/standalone/.next/ && \
  cp -r public .next/standalone/ && \
  npm ci --omit=dev && \
  npx prisma@6.19.3 db push --accept-data-loss && \
  pm2 reload cpr-platform --update-env"

echo "Deployment complete!"
