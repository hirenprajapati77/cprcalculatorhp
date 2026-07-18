#!/bin/bash
set -e

APP=/home/ubuntu/cpr-calculator-platform
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RELEASES_DIR=$APP/releases
BACKUP_DIR=$RELEASES_DIR/$TIMESTAMP

echo "=== Versioned Backup ==="
mkdir -p $RELEASES_DIR
if [ -d "$APP/.next/standalone" ]; then
    echo "Backing up current release to $BACKUP_DIR"
    mv $APP/.next/standalone $BACKUP_DIR
fi

echo "=== Extracting new release ==="
mkdir -p $APP/.next/standalone
tar -xzf /home/ubuntu/deploy_standalone.tar.gz -C $APP/.next/standalone

echo "=== Placing static assets ==="
mkdir -p $APP/.next/standalone/.next/static
tar -xzf /home/ubuntu/deploy_static.tar.gz -C $APP/.next/standalone/.next/static

echo "=== Extracting Prisma bundle ==="
tar -xzf /home/ubuntu/deploy_prisma.tar.gz -C $APP/

echo "=== Copying .env into standalone ==="
cp $APP/.env $APP/.next/standalone/.env

# Source DATABASE_URL if not present
if [ -z "$DATABASE_URL" ] && [ -f "$APP/.env" ]; then
    export DATABASE_URL=$(grep '^DATABASE_URL=' $APP/.env | cut -d '=' -f2- | sed -e 's/^"//' -e 's/"$//')
fi

echo "=== Recording pre-deploy migration state ==="
PRE_DEPLOY_MIGRATIONS=$(psql "$DATABASE_URL" -t -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at;" 2>/dev/null | sed '/^\s*$/d')

echo "=== Running Database Migrations ==="
cd $APP
npx prisma migrate deploy

echo "=== Recording post-deploy migration state ==="
POST_DEPLOY_MIGRATIONS=$(psql "$DATABASE_URL" -t -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at;" 2>/dev/null | sed '/^\s*$/d')
NEW_MIGRATIONS=$(comm -13 <(echo "$PRE_DEPLOY_MIGRATIONS" | sort) <(echo "$POST_DEPLOY_MIGRATIONS" | sort))

echo "=== Synchronizing Prisma Client ==="
npx prisma generate

echo "=== Restarting PM2 fresh (delete + start; never restart --update-env) ==="
cd $APP/.next/standalone
# Rulebook: PM2 caches env at process creation — delete then start so .env is reloaded.
pm2 delete cpr-platform || true
pm2 start server.js --name cpr-platform
pm2 save

echo "=== PM2 status ==="
pm2 list

echo "=== Health check (waiting 5s for startup) ==="
sleep 5
set +e
HEALTH_OUTPUT=$(curl -s http://localhost:3000/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('DB:', d['checks']['database'])" 2>/dev/null)
set -e

if [[ "$HEALTH_OUTPUT" == *"DB: healthy"* ]]; then
    echo "[OK] Health check passed! Database is up."
    echo "=== Cleanup ==="
    rm -f /home/ubuntu/deploy_standalone.tar.gz /home/ubuntu/deploy_static.tar.gz /home/ubuntu/deploy_prisma.tar.gz
    # Remove old backup to save space
    if [ -d "$BACKUP_DIR" ]; then
        echo "Removing old backup $BACKUP_DIR to conserve space"
        rm -rf $BACKUP_DIR
    fi
    echo "================================================"
    echo "  DEPLOY COMPLETE"
    echo "================================================"
else
    echo "[ERROR] Health check failed or DB is not up!"
    echo "Output was: $HEALTH_OUTPUT"
    echo "=== Initiating Automatic Rollback ==="
    
    if [ -n "$NEW_MIGRATIONS" ]; then
        echo "[CRITICAL] The following migration(s) were applied this deploy and CANNOT be automatically reverted:"
        echo "$NEW_MIGRATIONS"
        echo "[CRITICAL] Rolling back app code only. If the old code is incompatible with the new schema, this rollback may not restore a working state. Manual review required."
    fi
    
    if [ -d "$BACKUP_DIR" ]; then
        echo "Restoring from $BACKUP_DIR"
        rm -rf $APP/.next/standalone
        mv $BACKUP_DIR $APP/.next/standalone
        
        echo "Restarting PM2 with rolled-back release (delete + start)..."
        cd $APP/.next/standalone
        pm2 delete cpr-platform || true
        pm2 start server.js --name cpr-platform
        pm2 save
        
        echo "Waiting 5s for rollback to stabilize..."
        sleep 5
        set +e
        ROLLBACK_HEALTH=$(curl -s http://localhost:3000/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('DB:', d['checks']['database'])" 2>/dev/null)
        set -e
        if [[ "$ROLLBACK_HEALTH" == *"DB: healthy"* ]]; then
            echo "[OK] Rollback stabilized."
        else
            echo "[CRITICAL] Rollback also failed health check!"
        fi
    else
        echo "[CRITICAL] No backup found to restore!"
    fi
    exit 1
fi
