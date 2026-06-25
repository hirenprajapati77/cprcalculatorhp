#!/bin/bash
cd /home/ubuntu/cpr-calculator-platform

# Extract and backup
rm -rf .next_old
mv .next .next_old
tar -xzf next-build.tar.gz

# Restart PM2
pm2 restart all

# Create crontab
cat << 'EOF' > /tmp/cron_new
# Trade Journal — CPR signal logging (3:20 PM IST = 9:50 AM UTC)
50 9 * * 1-5 curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/cpr-journal >> /var/log/cpr-cron.log 2>&1

# Trade Journal — BTST/STBT signal logging (3:25 PM IST = 9:55 AM UTC)
55 9 * * 1-5 curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/btst-journal >> /var/log/cpr-cron.log 2>&1

# Trade Journal — 9:16 AM IST snapshot (3:46 AM UTC)
46 3 * * 1-5 curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/journal-snapshot >> /var/log/cpr-cron.log 2>&1

# Trade Journal — 9:30 AM IST snapshot (4:00 AM UTC)
0 4 * * 1-5 curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/journal-snapshot >> /var/log/cpr-cron.log 2>&1

# Trade Journal — 9:45 AM IST snapshot (4:15 AM UTC)
15 4 * * 1-5 curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/journal-snapshot >> /var/log/cpr-cron.log 2>&1

# Trade Journal — 10:00 AM IST auto-close (4:30 AM UTC)
30 4 * * 1-5 curl -s -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/journal-snapshot >> /var/log/cpr-cron.log 2>&1
EOF

crontab /tmp/cron_new

# Wait a few seconds for next.js to boot
sleep 5

echo "--- CURL TESTS ---"
source .env

echo "[1] API Journal (GET):"
curl -s http://129.159.230.41/api/journal | grep -o '{"success":true,"entries":\[\],"total":0' || echo "Failed check 1"

echo "[2] Page Load (GET):"
curl -s -o /dev/null -w "%{http_code}" http://129.159.230.41/journal

echo ""
echo "[3] CPR Cron (GET with Auth):"
curl -s -H "x-cron-secret: $CRON_SECRET" http://129.159.230.41/api/cron/cpr-journal

echo ""
echo "[4] Snapshot Cron (GET with Auth):"
curl -s -H "x-cron-secret: $CRON_SECRET" http://129.159.230.41/api/cron/journal-snapshot

echo ""
echo "DONE"
