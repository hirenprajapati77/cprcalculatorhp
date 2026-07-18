# Deploy pre-flight dry-run (no production)

Validates the `ops/deploy.sh` migration pre-flight against a **throwaway**
Docker Postgres. Does not use `DEPLOY_HOST`, `DEPLOY_KEY`, or `.env` `DATABASE_URL`.

## One command

From the repo root (Docker required):

```bash
./ops/deploy-dryrun.sh
```

Runs all scenarios (including `combo`). Or run one:

```bash
./ops/deploy-dryrun.sh no-drift
./ops/deploy-dryrun.sh pending
./ops/deploy-dryrun.sh unmigrated
./ops/deploy-dryrun.sh combo
```

## How to read the output

| Scenario | Meaning | Expect |
|---|---|---|
| `no-drift` | DB fully migrated; matches `schema.postgresql.prisma` | `OK: live database matches` → `RESULT no-drift: PASS` |
| `pending` | Newest migration folder not yet applied | Lists `Pending migrations` → `RESULT pending: PASS` |
| `unmigrated` | Schema has a canary model with no migration | `ERROR: … changes not captured in prisma/migrations` → `RESULT unmigrated: PASS` |
| `combo` | Pending migration **and** a separate unmigrated schema edit | Must **block** → `RESULT combo: PASS` |

If any scenario prints `RESULT …: FAIL`, do **not** run a real deploy until fixed.

When dry-run is green, real deploy still needs your live `DATABASE_URL` (+ optional `SHADOW_DATABASE_URL`, otherwise pre-flight tries to create `prisma_deploy_shadow`) and SSH env as documented in `ops/deploy.sh`.
