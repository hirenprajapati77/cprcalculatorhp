#!/bin/bash
# Dry-run the deploy.sh pre-flight against a throwaway Docker Postgres.
# Never touches DEPLOY_HOST, DEPLOY_KEY, production, or .env DATABASE_URL.
#
# Usage (from repo root):
#   ./ops/deploy-dryrun.sh              # run all three scenarios
#   ./ops/deploy-dryrun.sh no-drift
#   ./ops/deploy-dryrun.sh pending
#   ./ops/deploy-dryrun.sh unmigrated
#
# Requires: docker, npm, npx. See ops/DEPLOY_DRYRUN.md.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

# Ignore production deploy credentials / .env DATABASE_URL entirely.
unset DEPLOY_HOST DEPLOY_KEY DATABASE_URL || true

# shellcheck source=ops/lib/deploy-preflight.sh
source "${ROOT}/ops/lib/deploy-preflight.sh"

SCENARIO="${1:-all}"
CONTAINER="cpr-deploy-dryrun-$$"
PORT="$((55000 + RANDOM % 1000))"
PG_USER="postgres"
PG_PASS="dryrun"
PG_DB="cpr_dryrun"
HELD_MIGRATION=""
TMP_SCHEMA=""

cleanup() {
  if [ -n "${HELD_MIGRATION}" ] && [ -d "${HELD_MIGRATION}" ]; then
    # Restore any migration folder moved aside for the pending scenario
    HELD_NAME="$(basename "${HELD_MIGRATION}")"
    if [ ! -d "${ROOT}/prisma/migrations/${HELD_NAME}" ]; then
      mv "${HELD_MIGRATION}" "${ROOT}/prisma/migrations/${HELD_NAME}" || true
    fi
  fi
  if [ -n "${TMP_SCHEMA}" ] && [ -f "${TMP_SCHEMA}" ]; then
    rm -f "${TMP_SCHEMA}"
  fi
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is required for deploy dry-run (not found on PATH)"
    exit 1
  fi
}

start_postgres() {
  echo "Starting throwaway Postgres on 127.0.0.1:${PORT} (${CONTAINER})..."
  docker run -d --rm \
    --name "${CONTAINER}" \
    -e "POSTGRES_USER=${PG_USER}" \
    -e "POSTGRES_PASSWORD=${PG_PASS}" \
    -e "POSTGRES_DB=${PG_DB}" \
    -p "127.0.0.1:${PORT}:5432" \
    postgres:15-alpine >/dev/null

  export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@127.0.0.1:${PORT}/${PG_DB}"
  # Wait until ready
  for _ in $(seq 1 60); do
    if docker exec "${CONTAINER}" pg_isready -U "${PG_USER}" -d "${PG_DB}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "ERROR: Postgres container did not become ready"
  exit 1
}

migrate_deploy_all() {
  npx "prisma@${PRISMA_VERSION}" migrate deploy --schema=prisma/schema.postgresql.prisma
}

run_scenario_no_drift() {
  echo ""
  echo "=== SCENARIO: no-drift (fully migrated, schema matches) ==="
  start_postgres
  migrate_deploy_all
  SCHEMA_PG="prisma/schema.postgresql.prisma"
  if run_deploy_preflight; then
    echo "RESULT no-drift: PASS (pre-flight OK — safe to proceed shape)"
  else
    echo "RESULT no-drift: FAIL (expected OK)"
    exit 1
  fi
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  unset DATABASE_URL
}

run_scenario_pending() {
  echo ""
  echo "=== SCENARIO: pending (DB behind; newest migration not applied) ==="
  start_postgres

  # Move newest migration aside, apply older ones, restore folder, then pre-flight.
  NEWEST="$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort | tail -1)"
  if [ -z "${NEWEST}" ]; then
    echo "ERROR: no migrations found under prisma/migrations"
    exit 1
  fi
  HELD_MIGRATION="$(mktemp -d)/${NEWEST}"
  mv "prisma/migrations/${NEWEST}" "${HELD_MIGRATION}"
  migrate_deploy_all
  mv "${HELD_MIGRATION}" "prisma/migrations/${NEWEST}"
  HELD_MIGRATION=""

  SCHEMA_PG="prisma/schema.postgresql.prisma"
  if run_deploy_preflight; then
    echo "RESULT pending: PASS (pre-flight allows; migrate deploy would apply pending)"
  else
    echo "RESULT pending: FAIL (expected allow)"
    exit 1
  fi
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  unset DATABASE_URL
}

run_scenario_unmigrated() {
  echo ""
  echo "=== SCENARIO: unmigrated (schema edited, no matching migration) ==="
  start_postgres
  migrate_deploy_all

  TMP_SCHEMA="$(mktemp "${TMPDIR:-/tmp}/cpr-schema-XXXXXX.prisma")"
  cp prisma/schema.postgresql.prisma "${TMP_SCHEMA}"
  cat >> "${TMP_SCHEMA}" <<'EOF'

/// Injected only for deploy-dryrun unmigrated scenario — not a real model.
model DeployDryRunCanary {
  id String @id @default(cuid())
}
EOF

  SCHEMA_PG="${TMP_SCHEMA}"
  set +e
  run_deploy_preflight
  PRE_EXIT=$?
  set -e
  if [ "${PRE_EXIT}" -ne 0 ]; then
    echo "RESULT unmigrated: PASS (pre-flight blocked as expected)"
  else
    echo "RESULT unmigrated: FAIL (expected block)"
    exit 1
  fi
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  unset DATABASE_URL
  rm -f "${TMP_SCHEMA}"
  TMP_SCHEMA=""
}

require_docker

case "${SCENARIO}" in
  all)
    run_scenario_no_drift
    run_scenario_pending
    run_scenario_unmigrated
    echo ""
    echo "All dry-run scenarios passed."
    ;;
  no-drift) run_scenario_no_drift ;;
  pending) run_scenario_pending ;;
  unmigrated) run_scenario_unmigrated ;;
  *)
    echo "Usage: $0 [all|no-drift|pending|unmigrated]"
    exit 1
    ;;
esac
