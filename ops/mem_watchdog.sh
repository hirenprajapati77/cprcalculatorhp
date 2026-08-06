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

# NSE cash session 09:15–15:30 IST (Mon–Fri). Skip Redis FLUSHDB here so
# cron_done / unlock rate-limit keys survive memory pressure during market hours.
is_nse_cash_session() {
  local dow hour min total
  dow=$(TZ=Asia/Kolkata date +%u)
  hour=$(TZ=Asia/Kolkata date +%H)
  min=$(TZ=Asia/Kolkata date +%M)
  if [ "$dow" -gt 5 ]; then
    return 1
  fi
  total=$((10#$hour * 60 + 10#$min))
  if [ "$total" -ge 555 ] && [ "$total" -lt 930 ]; then
    return 0
  fi
  return 1
}

rotate_log

MEM_USED=$(free | awk '/^Mem:/{printf "%.0f", $3/$2*100}')
SWAP_USED=$(free | awk '/^Swap:/{if($2>0) printf "%.0f", $3/$2*100; else print 0}')
PM2_MEM=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; procs=json.load(sys.stdin); [print(p['monit']['memory']//1024//1024) for p in procs if p['name']=='cpr-platform']" 2>/dev/null || echo 0)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
IN_SESSION=0
if is_nse_cash_session; then IN_SESSION=1; fi

if [ "$MEM_USED" -gt 85 ]; then
  if [ "$IN_SESSION" -eq 1 ]; then
    echo "$TIMESTAMP [WARN] RAM=${MEM_USED}% SWAP=${SWAP_USED}% PM2=${PM2_MEM}MB — market session: PM2 restart WITHOUT Redis flush (preserve cron/rate-limit keys)" >> "$LOG"
    restart_pm2_fresh >> "$LOG" 2>&1
  else
    echo "$TIMESTAMP [WARN] RAM=${MEM_USED}% SWAP=${SWAP_USED}% PM2=${PM2_MEM}MB — flushing Redis + fresh PM2 restart" >> "$LOG"
    redis-cli FLUSHDB >> "$LOG" 2>&1
    restart_pm2_fresh >> "$LOG" 2>&1
  fi
  echo "$TIMESTAMP [INFO] Recovery complete" >> "$LOG"
elif [ "$MEM_USED" -gt 75 ]; then
  if [ "$IN_SESSION" -eq 1 ]; then
    echo "$TIMESTAMP [INFO] RAM=${MEM_USED}% SWAP=${SWAP_USED}% PM2=${PM2_MEM}MB — market session: skip Redis flush" >> "$LOG"
  else
    echo "$TIMESTAMP [INFO] RAM=${MEM_USED}% SWAP=${SWAP_USED}% PM2=${PM2_MEM}MB — flushing Redis cache only" >> "$LOG"
    redis-cli FLUSHDB >> "$LOG" 2>&1
  fi
fi

PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; procs=json.load(sys.stdin); [print(p['pm2_env']['status']) for p in procs if p['name']=='cpr-platform']" 2>/dev/null || echo "unknown")
if [ "$PM2_STATUS" != "online" ]; then
  echo "$TIMESTAMP [ALERT] cpr-platform is $PM2_STATUS — restarting!" >> "$LOG"
  restart_pm2_fresh >> "$LOG" 2>&1
fi
