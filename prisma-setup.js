const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const prismaDir = path.join(__dirname, 'prisma');
const schemaPath = path.join(prismaDir, 'schema.prisma');
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

console.log('--- Starting CPR Pro Database Setup ---');

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
    console.warn('\nPostgreSQL database not reachable. Falling back to SQLite local database...');
    try {
      configureSqlite();
      execSync('npx prisma db push', { stdio: 'inherit' });
      console.log('SQLite database synced successfully!');
    } catch (sqliteErr) {
      console.error('SQLite sync also failed:', sqliteErr.message);
    }
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
