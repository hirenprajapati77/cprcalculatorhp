# Deploy pre-flight dry-run (no production)

Validates the `ops/deploy.sh` migration pre-flight against a **throwaway**
Docker Postgres. Does not use `DEPLOY_HOST`, `DEPLOY_KEY`, or `.env` `DATABASE_URL`.

## One command

From the repo root (Docker required):

```bash
./ops/deploy-dryrun.sh
```

Runs all three scenarios. Or run one:

```bash
./ops/deploy-dryrun.sh no-drift
./ops/deploy-dryrun.sh pending
./ops/deploy-dryrun.sh unmigrated
```

## How to read the output

| Scenario | Meaning | Expect |
|---|---|---|
| `no-drift` | DB fully migrated; matches `schema.postgresql.prisma` | `OK: live database matches` → `RESULT no-drift: PASS` |
| `pending` | Newest migration folder not yet applied | Lists `Pending migrations` → `RESULT pending: PASS` |
| `unmigrated` | Schema has a canary model with no migration | `ERROR: Live database does not match` → `RESULT unmigrated: PASS` |

If any scenario prints `RESULT …: FAIL`, do **not** run a real deploy until fixed.

When dry-run is green, real deploy still needs your live `DATABASE_URL` + SSH env as documented in `ops/deploy.sh`.
