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
#
# Airtightness: "pending exists" alone is NOT enough. We also require
# prisma/migrations (end state) to fully cover SCHEMA_PG via
# `migrate diff --from-migrations --to-schema-datamodel` (needs a shadow DB).
# That blocks the combo case: legitimate pending migration + a separate
# unmigrated schema edit.

PRISMA_VERSION="${PRISMA_VERSION:-6.19.3}"
SCHEMA_PG="${SCHEMA_PG:-prisma/schema.postgresql.prisma}"
SHADOW_DB_NAME="${SHADOW_DB_NAME:-prisma_deploy_shadow}"

list_local_migration_names() {
  find prisma/migrations -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort
}

_ensure_pg_helper() {
  local helper_dir="$1"
  npm install --prefix "${helper_dir}" pg@8.13.1 --silent --no-audit --no-fund >/dev/null 2>&1
}

# Prints applied migration_name values (one per line). Exit 2 on query failure.
list_applied_migration_names() {
  local helper_dir rc=0
  helper_dir="$(mktemp -d "${TMPDIR:-/tmp}/cpr-pg-XXXXXX")"
  if ! _ensure_pg_helper "${helper_dir}"; then
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

# Derive SHADOW_DATABASE_URL from DATABASE_URL (same host/user, different DB name).
# Honors an already-exported SHADOW_DATABASE_URL.
derive_shadow_database_url() {
  if [ -n "${SHADOW_DATABASE_URL:-}" ]; then
    printf '%s\n' "${SHADOW_DATABASE_URL}"
    return 0
  fi
  node - <<'NODE'
const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error('DATABASE_URL missing');
  process.exit(2);
}
const u = new URL(raw);
u.pathname = '/' + (process.env.SHADOW_DB_NAME || 'prisma_deploy_shadow');
process.stdout.write(u.toString());
NODE
}

# Ensure the shadow database exists (CREATE DATABASE if missing). Fail closed.
ensure_shadow_database() {
  local shadow_url helper_dir rc=0
  shadow_url="$(derive_shadow_database_url)" || return 1
  export SHADOW_DATABASE_URL="${shadow_url}"

  helper_dir="$(mktemp -d "${TMPDIR:-/tmp}/cpr-pg-XXXXXX")"
  if ! _ensure_pg_helper "${helper_dir}"; then
    echo "ERROR: could not install temporary pg client for shadow DB setup" >&2
    rm -rf "${helper_dir}"
    return 1
  fi

  set +e
  SHADOW_DATABASE_URL="${shadow_url}" SHADOW_DB_NAME="${SHADOW_DB_NAME}" node - "${helper_dir}" <<'NODE'
const path = require('path');
const pg = require(path.join(process.argv[2], 'node_modules', 'pg'));
const liveUrl = process.env.DATABASE_URL;
const shadowUrl = process.env.SHADOW_DATABASE_URL;
const shadowName = process.env.SHADOW_DB_NAME || 'prisma_deploy_shadow';
if (!liveUrl || !shadowUrl) {
  console.error('DATABASE_URL / SHADOW_DATABASE_URL missing');
  process.exit(2);
}

function toMaintenanceUrl(urlStr) {
  const u = new URL(urlStr);
  u.pathname = '/postgres';
  return u.toString();
}

(async () => {
  // Already reachable?
  const probe = new pg.Client({ connectionString: shadowUrl });
  try {
    await probe.connect();
    await probe.end();
    process.exit(0);
  } catch {
    try { await probe.end(); } catch { /* ignore */ }
  }

  const admin = new pg.Client({ connectionString: toMaintenanceUrl(liveUrl) });
  try {
    await admin.connect();
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [shadowName]);
    if (exists.rowCount === 0) {
      // Identifier cannot be parameterized; name is controlled (SHADOW_DB_NAME).
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(shadowName)) {
        throw new Error(`Refusing unsafe SHADOW_DB_NAME: ${shadowName}`);
      }
      await admin.query(`CREATE DATABASE ${shadowName}`);
      console.error(`Created shadow database ${shadowName}`);
    }
    await admin.end();
  } catch (err) {
    console.error(err && err.message ? err.message : String(err));
    try { await admin.end(); } catch { /* ignore */ }
    process.exit(2);
  }
})();
NODE
  rc=$?
  set -e
  rm -rf "${helper_dir}"

  if [ "${rc}" -ne 0 ]; then
    echo "ERROR: could not ensure shadow database for migrations↔schema check."
    echo "Set SHADOW_DATABASE_URL to an empty Postgres database you can use, or grant"
    echo "CREATEDB so pre-flight can create '${SHADOW_DB_NAME}'."
    return 1
  fi
  return 0
}

# Exit 0 if prisma/migrations end-state matches SCHEMA_PG; 1 if not / error.
assert_migrations_cover_schema() {
  local diff_exit
  if ! ensure_shadow_database; then
    return 1
  fi

  echo "Pre-flight: checking prisma/migrations covers ${SCHEMA_PG} (shadow diff)..."
  set +e
  npx "prisma@${PRISMA_VERSION}" migrate diff \
    --from-migrations=prisma/migrations \
    --to-schema-datamodel="${SCHEMA_PG}" \
    --shadow-database-url="${SHADOW_DATABASE_URL}" \
    --exit-code
  diff_exit=$?
  set -e

  if [ "${diff_exit}" -eq 0 ]; then
    echo "OK: prisma/migrations fully covers ${SCHEMA_PG}"
    return 0
  fi

  if [ "${diff_exit}" -eq 2 ]; then
    echo ""
    echo "ERROR: ${SCHEMA_PG} has changes not captured in prisma/migrations/."
    echo "Pending migrations alone cannot explain this — create a migration for the"
    echo "remaining schema drift before deploying:"
    echo "  npx prisma migrate dev --create-only --schema=${SCHEMA_PG}"
    return 1
  fi

  echo "ERROR: migrations↔schema migrate diff failed (exit ${diff_exit})."
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

  # (1) Migrations must fully express the schema — closes pending+unmigrated combo.
  if ! assert_migrations_cover_schema; then
    return 1
  fi

  # (2) Live DB vs schema.
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
    echo "OK: live drift is behind migrations that already cover the schema"
    return 0
  fi

  if [ "${PENDING_EXIT}" -eq 2 ]; then
    echo "ERROR: could not list applied migrations from the database (ambiguous)."
    echo "Failing closed — fix DATABASE_URL / connectivity and retry."
    return 1
  fi

  # No pending, migrations cover schema, but live ≠ schema → manual / db-push drift.
  echo ""
  echo "ERROR: Live database does not match ${SCHEMA_PG}, migrations cover the schema,"
  echo "and there are no pending migration folders to apply. The live DB has drifted"
  echo "outside migrate history (e.g. old db push). Reconcile manually before deploy."
  echo "(migrate diff exit=${DIFF_EXIT}, pending-check exit=${PENDING_EXIT})"
  return 1
}
