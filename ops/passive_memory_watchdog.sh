#!/usr/bin/env bash
# ── PASSIVE MEMORY WATCHDOG (MONITORING ONLY) ─────────────────────────────────
# Strict Rule: Detection & Alerting ONLY. ZERO auto-restarts, ZERO kills, ZERO mutations.
# Log Path: /home/ubuntu/memory-alerts.log

LOG_FILE="/home/ubuntu/memory-alerts.log"
TIMESTAMP=$(date -u '+%Y-%m-%d %H:%M:%S UTC')

# Thresholds
AVAIL_MEM_MIN_MB=100
RSS_MAX_MB=600

# 1. Fetch available memory in MB
AVAIL_MEM_MB=$(free -m | awk '/^Mem:/{print $7}')

# 2. Fetch cpr-platform RSS memory in MB & restart count via pm2 jlist
PM2_DATA=$(pm2 jlist 2>/dev/null | python3 -c '
import sys, json
try:
    raw = sys.stdin.read().strip()
    if raw:
        procs = json.loads(raw)
        cpr = [p for p in procs if p.get("name") == "cpr-platform"]
        if cpr:
            rss = int(cpr[0].get("monit", {}).get("memory", 0) // 1024 // 1024)
            restarts = cpr[0].get("pm2_env", {}).get("restart_time", 0)
            status = cpr[0].get("pm2_env", {}).get("status", "unknown")
            print(f"{rss} {restarts} {status}")
            sys.exit(0)
except Exception:
    pass
print("0 0 unknown")
' 2>/dev/null || echo "0 0 unknown")

read -r RSS_MB RESTARTS STATUS <<< "$PM2_DATA"

ALERT_TRIGGERED=0
ALERT_REASON=""

# Threshold check 1: Available memory low
if [ "$AVAIL_MEM_MB" -lt "$AVAIL_MEM_MIN_MB" ]; then
  ALERT_TRIGGERED=1
  ALERT_REASON="Available RAM low: ${AVAIL_MEM_MB}MB (< ${AVAIL_MEM_MIN_MB}MB threshold)"
fi

# Threshold check 2: RSS memory high
if [ "$RSS_MB" -gt "$RSS_MAX_MB" ]; then
  ALERT_TRIGGERED=1
  if [ -n "$ALERT_REASON" ]; then
    ALERT_REASON="${ALERT_REASON} | RSS memory high: ${RSS_MB}MB (> ${RSS_MAX_MB}MB threshold)"
  else
    ALERT_REASON="RSS memory high: ${RSS_MB}MB (> ${RSS_MAX_MB}MB threshold)"
  fi
fi

# Threshold check 3: Status not online
if [ "$STATUS" != "online" ]; then
  ALERT_TRIGGERED=1
  if [ -n "$ALERT_REASON" ]; then
    ALERT_REASON="${ALERT_REASON} | Process status: ${STATUS}"
  else
    ALERT_REASON="Process status: ${STATUS}"
  fi
fi

if [ "$ALERT_TRIGGERED" -eq 1 ]; then
  MSG="[WARN] $TIMESTAMP | $ALERT_REASON | AvailMem: ${AVAIL_MEM_MB}MB | RSS: ${RSS_MB}MB | Restarts: ${RESTARTS}"
  echo "$MSG" >> "$LOG_FILE"
else
  echo "[OK] $TIMESTAMP | AvailMem: ${AVAIL_MEM_MB}MB | RSS: ${RSS_MB}MB | Restarts: ${RESTARTS} | Status: ${STATUS}" >> "$LOG_FILE"
fi
