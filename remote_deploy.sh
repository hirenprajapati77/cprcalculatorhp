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
