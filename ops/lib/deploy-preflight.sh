#!/bin/bash
# Shared deploy pre-flight: live DB vs Prisma schema + pending-migration detection.
# Sourced by ops/deploy.sh and ops/deploy-dryrun.sh — do not execute directly.
#
# Pending detection does NOT parse English from `prisma migrate status`.
# Verified prisma@6.19.3: `migrate status` has no --exit-code flag; exit 0 means
# up-to-date, exit 1 means pending OR connection error OR history drift OR failed
# migrations — too overloaded to gate deploy. We compare prisma/migrations/*
# directory names to "_prisma_migrations" instead.
# If you bump PRISMA_VERSION, re-verify migrate status CLI flags; keep this
# filesystem/DB comparison as the primary pending check.

PRISMA_VERSION="${PRISMA_VERSION:-6.19.3}"
SCHEMA_PG="${SCHEMA_PG:-prisma/schema.postgresql.prisma}"

list_local_migration_names() {
  find prisma/migrations -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort
}

# Prints applied migration_name values (one per line). Exit 2 on query failure.
list_applied_migration_names() {
  local helper_dir rc=0
  helper_dir="$(mktemp -d "${TMPDIR:-/tmp}/cpr-pg-XXXXXX")"
  if ! npm install --prefix "${helper_dir}" pg@8.13.1 --silent --no-audit --no-fund >/dev/null 2>&1; then
    echo "ERROR: could not install temporary pg client for migration listing" >&2
    rm -rf "${helper_dir}"
    return 2
  fi
  set +e
  node - "${helper_dir}" <<'NODE'
const path = require('path');
const pg = require(path.join(process.argv[2], 'node_modules', 'pg'));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(2);
}
const client = new pg.Client({ connectionString: url });
(async () => {
  try {
    await client.connect();
    const r = await client.query(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`
    );
    for (const row of r.rows) process.stdout.write(String(row.migration_name) + '\n');
    await client.end();
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(2);
  }
})();
NODE
  rc=$?
  set -e
  rm -rf "${helper_dir}"
  return "${rc}"
}

# Echo pending migration names; return 0 if any pending, 1 if none, 2 on error.
print_pending_migrations() {
  local applied local_migs pending=0
  if ! applied="$(list_applied_migration_names)"; then
    return 2
  fi
  local_migs="$(list_local_migration_names)"
  while IFS= read -r m; do
    [ -z "${m}" ] && continue
    if ! printf '%s\n' "${applied}" | grep -qxF "${m}"; then
      echo "${m}"
      pending=1
    fi
  done <<< "${local_migs}"
  if [ "${pending}" -eq 1 ]; then
    return 0
  fi
  return 1
}

# Run pre-flight against DATABASE_URL + SCHEMA_PG.
# Exit 0 = safe to proceed; exit 1 = block deploy.
run_deploy_preflight() {
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL is not set for deploy pre-flight"
    return 1
  fi
  if [ ! -f "${SCHEMA_PG}" ]; then
    echo "ERROR: schema file not found: ${SCHEMA_PG}"
    return 1
  fi

  echo "Pre-flight: checking live DB vs ${SCHEMA_PG} (prisma@${PRISMA_VERSION} migrate diff)..."
  set +e
  npx "prisma@${PRISMA_VERSION}" migrate diff \
    --from-url "${DATABASE_URL}" \
    --to-schema-datamodel="${SCHEMA_PG}" \
    --exit-code
  DIFF_EXIT=$?
  set -e

  if [ "${DIFF_EXIT}" -eq 0 ]; then
    echo "OK: live database matches ${SCHEMA_PG}"
    return 0
  fi

  if [ "${DIFF_EXIT}" -ne 2 ]; then
    echo "ERROR: prisma migrate diff failed (exit ${DIFF_EXIT}). Is DATABASE_URL reachable?"
    return 1
  fi

  echo "WARN: live database differs from ${SCHEMA_PG}; checking pending migrations via _prisma_migrations..."
  set +e
  PENDING_OUT="$(print_pending_migrations)"
  PENDING_EXIT=$?
  set -e

  if [ "${PENDING_EXIT}" -eq 0 ]; then
    echo "Pending migrations (will be applied by prisma migrate deploy on the server):"
    echo "${PENDING_OUT}" | sed 's/^/  - /'
    echo "OK: schema drift is explained by pending migrations"
    return 0
  fi

  if [ "${PENDING_EXIT}" -eq 2 ]; then
    echo "ERROR: could not list applied migrations from the database (ambiguous)."
    echo "Failing closed — fix DATABASE_URL / connectivity and retry."
    return 1
  fi

  # PENDING_EXIT == 1: no pending migrations, but schema≠live → unmigrated edit
  echo ""
  echo "ERROR: Live database does not match ${SCHEMA_PG}, and prisma/migrations/"
  echo "has no unapplied migration folders that would reconcile the drift."
  echo "This usually means the schema was edited without creating a migration."
  echo "Do NOT use db push. Generate a migration locally, commit it, then redeploy:"
  echo "  npx prisma migrate dev --create-only --schema=${SCHEMA_PG}"
  echo "(migrate diff exit=${DIFF_EXIT}, pending-check exit=${PENDING_EXIT})"
  return 1
}
