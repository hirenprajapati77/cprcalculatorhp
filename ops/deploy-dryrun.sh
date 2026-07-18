#!/bin/bash
# Dry-run the deploy.sh pre-flight against a throwaway Docker Postgres.
# Never touches DEPLOY_HOST, DEPLOY_KEY, production, or .env DATABASE_URL.
#
# Usage (from repo root):
#   ./ops/deploy-dryrun.sh              # run all scenarios (incl. combo)
#   ./ops/deploy-dryrun.sh no-drift
#   ./ops/deploy-dryrun.sh pending
#   ./ops/deploy-dryrun.sh unmigrated
#   ./ops/deploy-dryrun.sh combo        # pending + unmigrated schema edit (must BLOCK)
#
# Requires: docker, npm, npx. See ops/DEPLOY_DRYRUN.md.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

# Ignore production deploy credentials / .env DATABASE_URL entirely.
unset DEPLOY_HOST DEPLOY_KEY DATABASE_URL SHADOW_DATABASE_URL || true

# shellcheck source=ops/lib/deploy-preflight.sh
source "${ROOT}/ops/lib/deploy-preflight.sh"

SCENARIO="${1:-all}"
CONTAINER="cpr-deploy-dryrun-$$"
PORT="$((55000 + RANDOM % 1000))"
PG_USER="postgres"
PG_PASS="dryrun"
PG_DB="cpr_dryrun"
PG_SHADOW="cpr_dryrun_shadow"
HELD_MIGRATION=""
TMP_SCHEMA=""

cleanup() {
  if [ -n "${HELD_MIGRATION}" ] && [ -d "${HELD_MIGRATION}" ]; then
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

stop_postgres() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  unset DATABASE_URL SHADOW_DATABASE_URL || true
}

start_postgres() {
  stop_postgres
  echo "Starting throwaway Postgres on 127.0.0.1:${PORT} (${CONTAINER})..."
  docker run -d --rm \
    --name "${CONTAINER}" \
    -e "POSTGRES_USER=${PG_USER}" \
    -e "POSTGRES_PASSWORD=${PG_PASS}" \
    -e "POSTGRES_DB=${PG_DB}" \
    -p "127.0.0.1:${PORT}:5432" \
    postgres:15-alpine >/dev/null

  export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@127.0.0.1:${PORT}/${PG_DB}"
  for _ in $(seq 1 60); do
    if docker exec "${CONTAINER}" pg_isready -U "${PG_USER}" -d "${PG_DB}" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
  if ! docker exec "${CONTAINER}" pg_isready -U "${PG_USER}" -d "${PG_DB}" >/dev/null 2>&1; then
    echo "ERROR: Postgres container did not become ready"
    exit 1
  fi

  # Shadow DB for migrations↔schema migrate diff (ignore "already exists").
  docker exec "${CONTAINER}" psql -U "${PG_USER}" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE ${PG_SHADOW}" >/dev/null 2>&1 || true

  export SHADOW_DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@127.0.0.1:${PORT}/${PG_SHADOW}"
  export SHADOW_DB_NAME="${PG_SHADOW}"
}

migrate_deploy_all() {
  npx "prisma@${PRISMA_VERSION}" migrate deploy --schema=prisma/schema.postgresql.prisma
}

# Apply all migrations except the newest (leaves that one pending after restore).
apply_all_but_newest_migration() {
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
  echo "Newest migration left pending: ${NEWEST}"
}

make_canary_schema() {
  TMP_SCHEMA="$(mktemp "${TMPDIR:-/tmp}/cpr-schema-XXXXXX.prisma")"
  cp prisma/schema.postgresql.prisma "${TMP_SCHEMA}"
  cat >> "${TMP_SCHEMA}" <<'EOF'

/// Injected only for deploy-dryrun — not a real model.
model DeployDryRunCanary {
  id String @id @default(cuid())
}
EOF
  SCHEMA_PG="${TMP_SCHEMA}"
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
  stop_postgres
}

run_scenario_pending() {
  echo ""
  echo "=== SCENARIO: pending (DB behind; newest migration not applied) ==="
  start_postgres
  apply_all_but_newest_migration
  SCHEMA_PG="prisma/schema.postgresql.prisma"
  if run_deploy_preflight; then
    echo "RESULT pending: PASS (pre-flight allows; migrate deploy would apply pending)"
  else
    echo "RESULT pending: FAIL (expected allow)"
    exit 1
  fi
  stop_postgres
}

run_scenario_unmigrated() {
  echo ""
  echo "=== SCENARIO: unmigrated (schema edited, no matching migration) ==="
  start_postgres
  migrate_deploy_all
  make_canary_schema
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
  stop_postgres
  rm -f "${TMP_SCHEMA}"
  TMP_SCHEMA=""
}

run_scenario_combo() {
  echo ""
  echo "=== SCENARIO: combo (pending migration + separate unmigrated schema edit) ==="
  echo "This must BLOCK — pending alone must not greenlight extra schema drift."
  start_postgres
  apply_all_but_newest_migration
  make_canary_schema
  set +e
  run_deploy_preflight
  PRE_EXIT=$?
  set -e
  if [ "${PRE_EXIT}" -ne 0 ]; then
    echo "RESULT combo: PASS (pre-flight blocked despite pending migrations)"
  else
    echo "RESULT combo: FAIL (expected block — gap still open)"
    exit 1
  fi
  stop_postgres
  rm -f "${TMP_SCHEMA}"
  TMP_SCHEMA=""
}

require_docker

case "${SCENARIO}" in
  all)
    run_scenario_no_drift
    run_scenario_pending
    run_scenario_unmigrated
    run_scenario_combo
    echo ""
    echo "All dry-run scenarios passed."
    ;;
  no-drift) run_scenario_no_drift ;;
  pending) run_scenario_pending ;;
  unmigrated) run_scenario_unmigrated ;;
  combo) run_scenario_combo ;;
  *)
    echo "Usage: $0 [all|no-drift|pending|unmigrated|combo]"
    exit 1
    ;;
esac
