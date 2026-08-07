#!/bin/bash
# Low-RAM recovery for Oracle free tier (~1 GB). Runs every 5 min via crontab.
LOG="/home/ubuntu/mem_watchdog.log"
MAX_LOG_LINES=500
APP="/home/ubuntu/cpr-calculator-platform/.next/standalone"
ECOSYSTEM="/home/ubuntu/ecosystem.config.cjs"

rotate_log() {
  if [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt "$MAX_LOG_LINES" ]; then
    tail -100 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
  fi
}

restart_pm2_fresh() {
  pm2 delete cpr-platform >/dev/null 2>&1 || true
  if [ -f "$ECOSYSTEM" ]; then
    pm2 start "$ECOSYSTEM" || return 1
  elif [ -f "$APP/server.js" ]; then
    cd "$APP" || return 1
    NODE_OPTIONS='--max-old-space-size=384' pm2 start server.js --name cpr-platform --max-memory-restart 450M || return 1
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] Cannot restart — missing $ECOSYSTEM and $APP/server.js" >> "$LOG"
    return 1
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

# Always emit one token. Empty stdout previously meant status="" → false restart loops.
read_pm2_status() {
  pm2 jlist 2>/dev/null | python3 -c '
import sys, json
try:
    raw = sys.stdin.read().strip()
    if not raw:
        print("unknown")
        raise SystemExit(0)
    procs = json.loads(raw)
    statuses = [p.get("pm2_env", {}).get("status") for p in procs if p.get("name") == "cpr-platform"]
    print(statuses[0] if statuses and statuses[0] else "missing")
except Exception:
    print("unknown")
' 2>/dev/null || echo "unknown"
}

read_pm2_mem_mb() {
  pm2 jlist 2>/dev/null | python3 -c '
import sys, json
try:
    raw = sys.stdin.read().strip()
    if not raw:
        print(0)
        raise SystemExit(0)
    procs = json.loads(raw)
    mems = [p.get("monit", {}).get("memory", 0) for p in procs if p.get("name") == "cpr-platform"]
    print(int((mems[0] if mems else 0) // 1024 // 1024))
except Exception:
    print(0)
' 2>/dev/null || echo 0
}

rotate_log

MEM_USED=$(free | awk '/^Mem:/{printf "%.0f", $3/$2*100}')
SWAP_USED=$(free | awk '/^Swap:/{if($2>0) printf "%.0f", $3/$2*100; else print 0}')
PM2_MEM=$(read_pm2_mem_mb)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
IN_SESSION=0
if is_nse_cash_session; then IN_SESSION=1; fi

if [ "$MEM_USED" -gt 85 ]; then
  if [ "$IN_SESSION" -eq 1 ]; then
    echo "$TIMESTAMP [WARN] RAM=${MEM_USED}% SWAP=${SWAP_USED}% PM2=${PM2_MEM}MB — market session: PM2 restart WITHOUT Redis flush" >> "$LOG"
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

PM2_STATUS=$(read_pm2_status)
# Only act on definitive down states — never on unknown/empty parse failures.
case "$PM2_STATUS" in
  stopped|errored|missing)
    echo "$TIMESTAMP [ALERT] cpr-platform is $PM2_STATUS — restarting!" >> "$LOG"
    restart_pm2_fresh >> "$LOG" 2>&1
    ;;
esac
