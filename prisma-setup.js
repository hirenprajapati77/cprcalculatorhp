/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const prismaDir = path.join(__dirname, 'prisma');
const schemaPath = path.join(prismaDir, 'schema.prisma');
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');
const noFallback = process.argv.includes('--no-fallback');

function printSqliteFallbackWarning() {
  const box = [
    '',
    '╔══════════════════════════════════════════════════════════════════════════╗',
    '║  ⚠️  WARNING: prisma/schema.prisma IS ABOUT TO BE MODIFIED ON DISK       ║',
    '║                                                                          ║',
    '║  PostgreSQL is unreachable. Falling back to SQLite for local setup.      ║',
    '║  This will change:                                                       ║',
    '║    • prisma/schema.prisma  provider "postgresql" → "sqlite"              ║',
    '║    • .env                  DATABASE_URL → file:./dev.db                  ║',
    '║                                                                          ║',
    '║  DO NOT COMMIT prisma/schema.prisma in this state.                       ║',
    '║  Production requires provider = "postgresql".                            ║',
    '║  Restore with: git checkout -- prisma/schema.prisma                      ║',
    '║  Or re-run setup once Postgres is available.                             ║',
    '║                                                                          ║',
    '║  Tip: pass --no-fallback to fail instead of rewriting schema.prisma.     ║',
    '╚══════════════════════════════════════════════════════════════════════════╝',
    '',
  ].join('\n');
  console.warn(box);
}

function printSchemaPrismaGitDiff() {
  console.warn('--- git diff --stat prisma/schema.prisma (post-fallback mutation) ---');
  try {
    const diffStat = execSync('git diff --stat -- prisma/schema.prisma', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (diffStat && diffStat.trim()) {
      console.warn(diffStat.trimEnd());
    } else {
      console.warn('(no git diff for prisma/schema.prisma — untracked, clean, or not a git repo)');
    }
  } catch (diffErr) {
    console.warn('Could not run git diff --stat prisma/schema.prisma:', diffErr.message);
  }
  console.warn('---------------------------------------------------------------------');
}

console.log('--- Starting CPR Pro Database Setup ---');
if (noFallback) {
  console.log('Flag --no-fallback enabled: will not rewrite schema.prisma to sqlite on Postgres failure.');
}
// 1. Load or initialize .env file
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf-8');
} else if (fs.existsSync(envExamplePath)) {
  console.log('Copying .env.example to .env');
  envContent = fs.readFileSync(envExamplePath, 'utf-8');
  fs.writeFileSync(envPath, envContent);
} else {
  console.log('Creating new .env file');
  envContent = 'DATABASE_URL="file:./dev.db"\nREDIS_URL=""\nNEXT_PUBLIC_BASE_URL="http://localhost:3000"\nNODE_ENV="development"\n';
  fs.writeFileSync(envPath, envContent);
}

// Helper to configure SQLite
function configureSqlite() {
  console.log('Configuring Prisma for SQLite local database...');
  let schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  schemaContent = schemaContent.replace(/provider\s*=\s*["']postgresql["']/g, 'provider = "sqlite"');
  fs.writeFileSync(schemaPath, schemaContent);

  // Update DATABASE_URL in .env to SQLite
  const dbUrlMatch = envContent.match(/DATABASE_URL=["']?([^"'\s]+)["']?/);
  if (dbUrlMatch) {
    envContent = envContent.replace(dbUrlMatch[0], 'DATABASE_URL="file:./dev.db"');
  } else {
    envContent += '\nDATABASE_URL="file:./dev.db"';
  }
  fs.writeFileSync(envPath, envContent);
  // Reload env variables for this process
  process.env.DATABASE_URL = 'file:./dev.db';
}

// Helper to configure PostgreSQL
function configurePostgres() {
  console.log('Configuring Prisma for PostgreSQL database...');
  let schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  schemaContent = schemaContent.replace(/provider\s*=\s*["']sqlite["']/g, 'provider = "postgresql"');
  fs.writeFileSync(schemaPath, schemaContent);
}

// 2. Parse DATABASE_URL
const dbUrlMatch = envContent.match(/DATABASE_URL=["']?([^"'\s]+)["']?/);
let dbUrl = dbUrlMatch ? dbUrlMatch[1] : '';

const forceSqlite = !dbUrl || dbUrl.includes('placeholder') || dbUrl.startsWith('file:') || !dbUrl.startsWith('postgresql');

if (forceSqlite) {
  configureSqlite();
} else {
  configurePostgres();
}

// 3. Try to sync database schema
console.log('Running Prisma schema sync...');
try {
  execSync('npx prisma db push', { stdio: 'inherit' });
  console.log('Database synced successfully!');
} catch (err) {
  if (!forceSqlite) {
    if (noFallback) {
      console.error('\nERROR: PostgreSQL database not reachable.');
      console.error('Refusing to fall back to SQLite because --no-fallback was passed.');
      console.error('Fix DATABASE_URL / start Postgres, then re-run. prisma/schema.prisma was NOT modified for fallback.');
      process.exit(1);
    }
    printSqliteFallbackWarning();
    try {
      configureSqlite();
      execSync('npx prisma db push', { stdio: 'inherit' });
      console.log('SQLite database synced successfully!');
    } catch (sqliteErr) {
      console.error('SQLite sync also failed:', sqliteErr.message);
    }
    printSchemaPrismaGitDiff();
  } else {
    console.error('Error syncing database schema:', err.message);
  }
}

// 4. Generate Prisma Client
console.log('Generating Prisma client...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('Prisma Client generated successfully!');
} catch (err) {
  console.error('Failed to generate Prisma client:', err.message);
}

console.log('--- Database Setup Completed ---');
