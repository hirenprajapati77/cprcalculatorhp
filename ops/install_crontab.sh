#!/bin/bash
# ==============================================================================
# CPR Platform - Crontab Installer
# Safely installs production crontab from ops/crontab.example.txt using $CRON_SECRET.
# Includes automatic timestamped backups, safe token substitution, and diff preview.
# ==============================================================================
set -e

if [ -z "${CRON_SECRET}" ]; then
  echo "Error: CRON_SECRET environment variable must be set before installing crontab." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/crontab.example.txt"

if [ ! -f "${TEMPLATE}" ]; then
  echo "Error: Template file ${TEMPLATE} not found." >&2
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${HOME}/crontab.bak.${TIMESTAMP}"
CURRENT_TMP="/tmp/crontab.current.${TIMESTAMP}"
RENDERED_TMP="/tmp/crontab.rendered.${TIMESTAMP}"

# 1. Capture current crontab to backup
crontab -l > "${BACKUP_FILE}" 2>/dev/null || touch "${BACKUP_FILE}"
echo "Saved backup of current crontab to ${BACKUP_FILE}"
cp "${BACKUP_FILE}" "${CURRENT_TMP}"

# 2. Render template using Python to safely handle any special characters in CRON_SECRET (e.g. /, &, \)
python3 -c "
import os, sys

template_path = sys.argv[1]
cron_secret = os.environ.get('CRON_SECRET', '')

with open(template_path, 'r') as f:
    lines = f.readlines()

output = []
for line in lines:
    stripped = line.strip()
    if not stripped or stripped.startswith('#'):
        continue
    rendered = line.replace('\${CRON_SECRET}', cron_secret)
    output.append(rendered)

sys.stdout.write(''.join(output))
" "${TEMPLATE}" > "${RENDERED_TMP}"

# 3. Display diff
echo "=== Proposed Crontab Changes (diff -u current new) ==="
diff -u "${CURRENT_TMP}" "${RENDERED_TMP}" || true
echo "======================================================"

if [ "$1" == "--dry-run" ]; then
  echo "Dry run complete. No changes applied."
  rm -f "${CURRENT_TMP}" "${RENDERED_TMP}"
  exit 0
fi

# 4. Install new crontab
crontab "${RENDERED_TMP}"
rm -f "${CURRENT_TMP}" "${RENDERED_TMP}"

echo "Installed $(crontab -l | wc -l) cron jobs successfully."
