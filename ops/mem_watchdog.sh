#!/bin/bash
# Low-RAM recovery for Oracle free tier (~1 GB). Runs every 5 min via crontab.
LOG="/home/ubuntu/mem_watchdog.log"
MAX_LOG_LINES=500
APP="/home/ubuntu/cpr-calculator-platform/.next/standalone"
ECOSYSTEM="/home/ubuntu/ecosystem.config.cjs"

rotate_log() {
  if [ -f "$LOG" ] && [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt "$MAX_LOG_LINES" ]; then
    tail -100 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
  fi
}

restart_pm2_fresh() {
  pm2 delete cpr-platform >/dev/null 2>&1 || true
  if [ -f "$ECOSYSTEM" ]; then
    pm2 start "$ECOSYSTEM" || return 1
  elif [ -f "$APP/server.js" ]; then
    cd "$APP" || return 1
    NODE_OPTIONS='--max-old-space-size=384' pm2 start server.js --name cpr-platform --max-memory-restart 650M || return 1
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] Cannot restart — missing $ECOSYSTEM and $APP/server.js" >> "$LOG"
    return 1
  fi
  pm2 save
}

is_protected_redis_key() {
  local key="$1"
  case "$key" in
    cron_lock:*)
      return 0
      ;;
    cron_done:*)
      return 0
      ;;
    rate_limit:*)
      return 0
      ;;
    calc:share:*)
      return 0
      ;;
    stock_data_*|market:*|market_tools:*|market_breadth:*)
      # H5 fix: stock data is read mid-scan by overnight BTST/STBT jobs.
      # Pruning these during an active scan causes partial OHLC loss —
      # mismatched entries, missing option suggestions, and wrong CPR values.
      # Also protect market_tools:* and market_breadth:* daily reports.
      return 0
      ;;
    option_chain_*)
      # H5 fix: option chain data is fetched per-symbol during overnight runs.
      # Evicting mid-scan produces blank strike suggestions in the Telegram alert.
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

prune_redis_cache_preserving_protected_keys() {
  local start_time
  start_time=$(python3 -c "import time; print(time.time())" 2>/dev/null || date +%s)

  local deleted=0
  local skipped=0
  local key
  local batch=()
  local batch_size=500

  # Avoid FLUSHDB so retain-claim, unlock guards, and calculation share links survive off-hours pressure cleanup.
  # Protected keys: cron_lock:*, cron_done:*, rate_limit:*, calc:share:*, stock_data_*, market:*, option_chain_*
  # Safe to prune: scanner_results_*, history:limit:*, auto_scan_result:* — these regenerate on cache-miss.
  while IFS= read -r key; do
    [ -z "$key" ] && continue
    if is_protected_redis_key "$key"; then
      skipped=$((skipped + 1))
      continue
    fi

    batch+=("$key")

    if [ "${#batch[@]}" -ge "$batch_size" ]; then
      local num_deleted
      num_deleted=$(redis-cli DEL "${batch[@]}" 2>/dev/null)
      if [[ "$num_deleted" =~ ^[0-9]+$ ]]; then
        deleted=$((deleted + num_deleted))
      fi
      batch=()
    fi
  done < <(redis-cli --scan 2>/dev/null)

  # Process any remaining keys in final batch
  if [ "${#batch[@]}" -gt 0 ]; then
    local num_deleted
    num_deleted=$(redis-cli DEL "${batch[@]}" 2>/dev/null)
    if [[ "$num_deleted" =~ ^[0-9]+$ ]]; then
      deleted=$((deleted + num_deleted))
    fi
  fi

  local end_time
  end_time=$(python3 -c "import time; print(time.time())" 2>/dev/null || date +%s)
  local elapsed
  elapsed=$(python3 -c "print(f'{float(\"$end_time\") - float(\"$start_time\"):.3f}')" 2>/dev/null || echo "0")

  echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Redis prune complete: deleted=$deleted preserved=$skipped elapsed=${elapsed}s" >> "$LOG"
}

# NSE cash session 09:15–15:30 IST (Mon–Fri). During session we avoid Redis cache
# pruning entirely; outside session we prune but still preserve critical guard keys.
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
    echo "$TIMESTAMP [WARN] RAM=${MEM_USED}% SWAP=${SWAP_USED}% PM2=${PM2_MEM}MB — pruning Redis cache + fresh PM2 restart" >> "$LOG"
    prune_redis_cache_preserving_protected_keys >> "$LOG" 2>&1
    restart_pm2_fresh >> "$LOG" 2>&1
  fi
  echo "$TIMESTAMP [INFO] Recovery complete" >> "$LOG"
elif [ "$MEM_USED" -gt 75 ]; then
  if [ "$IN_SESSION" -eq 1 ]; then
    echo "$TIMESTAMP [INFO] RAM=${MEM_USED}% SWAP=${SWAP_USED}% PM2=${PM2_MEM}MB — market session: skip Redis flush" >> "$LOG"
  else
    echo "$TIMESTAMP [INFO] RAM=${MEM_USED}% SWAP=${SWAP_USED}% PM2=${PM2_MEM}MB — pruning Redis cache only" >> "$LOG"
    prune_redis_cache_preserving_protected_keys >> "$LOG" 2>&1
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
