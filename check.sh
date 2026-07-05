#!/bin/bash
echo "--- Postgres query ---"
sudo -u postgres psql -d cpr_pro -c 'SELECT symbol, score, date FROM "ScannerResult" WHERE date = '\''2026-06-29'\'' AND score >= 75 ORDER BY score DESC LIMIT 5;'

echo "--- Manual snapshot trigger ---"
curl -s -H "x-cron-secret: 7d38932e1fa8a281f24445fb02033f37f684d1b00b89335efaad18e95bbb0b97" http://localhost:3000/api/cron/journal-snapshot

echo "--- Checking crontab ---"
crontab -l

echo "--- Checking cron errors in syslog ---"
grep CRON /var/log/syslog | tail -n 20
