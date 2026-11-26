#!/bin/bash
# ==============================================================================
# CPR Platform - Crontab Installer
# Installs the production crontab from ops/crontab.example.txt using $CRON_SECRET.
#
# Usage:  CRON_SECRET=... ./ops/install_crontab.sh [--dry-run | -y | --yes]
#   --dry-run  show a redacted diff, change nothing
#   -y/--yes   apply without the confirmation prompt (non-interactive runs)
#
# Safety: umask 077 (backups/temp files are owner-only), timestamped backup of the
# current crontab, the secret is NEVER printed (diff is redacted), and the whole
# crontab is replaced only after confirmation. Jobs on the server that are not in
# the template are removed, so read the diff.
# ==============================================================================
set -euo pipefail
umask 077

DRY_RUN=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -y|--yes) ASSUME_YES=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if [ -z "${CRON_SECRET:-}" ]; then
  echo "Error: CRON_SECRET environment variable must be set before installing crontab." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/crontab.example.txt"
[ -f "${TEMPLATE}" ] || { echo "Error: Template file ${TEMPLATE} not found." >&2; exit 1; }

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${HOME}/crontab.bak.${TIMESTAMP}"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT
RENDERED="${WORKDIR}/rendered"
CURRENT_RED="${WORKDIR}/current.redacted"
RENDERED_RED="${WORKDIR}/rendered.redacted"

# 1. Backup current crontab (owner-only because of umask)
if crontab -l > "${BACKUP_FILE}" 2>/dev/null; then :; else : > "${BACKUP_FILE}"; fi
echo "Saved backup of current crontab to ${BACKUP_FILE}"

# 2. Render template (python avoids sed escaping problems with /, &, \ in the secret)
python3 - "${TEMPLATE}" "${BACKUP_FILE}" "${RENDERED}" "${CURRENT_RED}" "${RENDERED_RED}" <<'PY'
import os, re, sys
template, backup, rendered, current_red, rendered_red = sys.argv[1:6]
secret = os.environ["CRON_SECRET"]
mask = "[REDACTED_SECRET]"
# Redact any x-cron-secret header value (current OR rotated-out secrets), plus the exact secret.
hdr = re.compile(r'(x-cron-secret:\s*)[^"\s]+')
def redact(text):
    return hdr.sub(lambda m: m.group(1) + mask, text.replace(secret, mask))
jobs = []
with open(template) as f:
    for line in f:
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        jobs.append(line if line.endswith("\n") else line + "\n")
out = [j.replace("${CRON_SECRET}", secret) for j in jobs]
with open(rendered, "w") as f:
    f.write("".join(out))
with open(rendered_red, "w") as f:
    f.write(redact("".join(out)))
with open(backup) as f:
    cur = f.read()
with open(current_red, "w") as f:
    f.write(redact(cur))
PY

# 3. Redacted diff
echo "=== Proposed crontab changes (secret redacted) ==="
diff -u "${CURRENT_RED}" "${RENDERED_RED}" || true
echo "=================================================="

if [ "${DRY_RUN}" -eq 1 ]; then
  echo "Dry run complete. No changes applied."
  exit 0
fi

# 4. Confirm, then install
if [ "${ASSUME_YES}" -ne 1 ]; then
  read -r -p "Apply this crontab? [y/N] " reply
  case "${reply}" in y|Y|yes|YES) ;; *) echo "Aborted. No changes applied."; exit 0 ;; esac
fi
crontab "${RENDERED}"
echo "Installed $(crontab -l | grep -vc '^\s*$') cron entries. Previous crontab: ${BACKUP_FILE}"
