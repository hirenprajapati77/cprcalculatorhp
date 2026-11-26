#!/bin/bash
# ==============================================================================
# CPR Platform - Crontab Installer
# Installs production crontab from ops/crontab.example.txt using $CRON_SECRET
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

echo "Rendering crontab from ${TEMPLATE} with CRON_SECRET..."
sed "s/\${CRON_SECRET}/${CRON_SECRET}/g" "${TEMPLATE}" | grep -v '^#' | grep -v '^\s*$' | crontab -

echo "Installed $(crontab -l | wc -l) cron jobs successfully."
