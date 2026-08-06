#!/bin/bash
# Low-RAM recovery for Oracle free tier (~1 GB). Runs every 5 min via crontab.
LOG="/home/ubuntu/mem_watchdog.log"
MAX_LOG_LINES=500
APP="/home/ubuntu/cpr-calculator-platform/.next/standalone"

rotate_log() {
  if [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt "$MAX_LOG_LINES" ]; then
    tail -100 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
  fi
}

restart_pm2_fresh() {
  cd "$APP" || return 1
  pm2 delete cpr-platform >/dev/null 2>&1 || true
  if [ -f /home/ubuntu/ecosystem.config.cjs ]; then
    pm2 start /home/ubuntu/ecosystem.config.cjs
  else
    NODE_OPTIONS='--max-old-space-size=384' pm2 start server.js --name cpr-platform --max-memory-restart 450M
  fi
  pm2 save
}

rotate_log

MEM_USED=$(free | awk '/^Mem:/{printf "%.0f", $3/$2*100}')
SWAP_USED=$(free | awk '/^Swap:/{if($2>0) printf "%.0f", $3/$2*100; else print 0}')
PM2_MEM=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; procs=json.load(sys.stdin); [print(p['monit']['memory']//1024//1024) for p in procs if p['name']=='cpr-platform']" 2>/dev/null || echo 0)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

if [ "$MEM_USED" -gt 85 ]; then
  echo "$TIMESTAMP [WARN] RAM=${MEM_USED}% SWAP=${SWAP_USED}% PM2=${PM2_MEM}MB — flushing Redis + fresh PM2 restart" >> "$LOG"
  redis-cli FLUSHDB >> "$LOG" 2>&1
  restart_pm2_fresh >> "$LOG" 2>&1
  echo "$TIMESTAMP [INFO] Recovery complete" >> "$LOG"
elif [ "$MEM_USED" -gt 75 ]; then
  echo "$TIMESTAMP [INFO] RAM=${MEM_USED}% SWAP=${SWAP_USED}% PM2=${PM2_MEM}MB — flushing Redis cache only" >> "$LOG"
  redis-cli FLUSHDB >> "$LOG" 2>&1
fi

PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; procs=json.load(sys.stdin); [print(p['pm2_env']['status']) for p in procs if p['name']=='cpr-platform']" 2>/dev/null || echo "unknown")
if [ "$PM2_STATUS" != "online" ]; then
  echo "$TIMESTAMP [ALERT] cpr-platform is $PM2_STATUS — restarting!" >> "$LOG"
  restart_pm2_fresh >> "$LOG" 2>&1
fi
