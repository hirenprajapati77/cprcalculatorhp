#!/bin/bash
# Write first 8 lines of existing crontab (preserve existing jobs)
crontab -l | head -8 > /tmp/ct.txt

# Append the auto-scan entry cleanly
cat >> /tmp/ct.txt << 'EOF'
*/5 9-15 * * 1-5 curl -s -H "x-cron-secret: cpr-prod-token-v2-2026" "http://localhost:3000/api/cron/auto-scan?universe=NIFTY_FNO" >> /var/log/cpr-cron/auto-scan.log 2>&1
EOF

# Install the new crontab
crontab /tmp/ct.txt

echo "=== Crontab installed. Last 3 lines ==="
crontab -l | tail -3
