#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:?Set PGPASSWORD in your shell before running ops/verify.sh}"

PGHOST="${PGHOST:-localhost}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-cpr_pro}"

psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c '\d+ "ScannerResult"'
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c '\d+ "Trade"'
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c '\d+ "BtstSignal"'
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -c '\d+ "BacktestRun"'
