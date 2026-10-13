/**
 * Secrets Rotation Script — CPR Platform
 *
 * OWNER POLICY & SAFETY GUARDS:
 * 1. Personal single-operator system: APP_ACCESS_TOKEN is NEVER auto-rotated.
 * 2. TOKEN_ENCRYPTION_KEY rotation requires explicit acknowledgment (--i-understand-data-loss).
 *    Rotating TOKEN_ENCRYPTION_KEY without migrating/re-encrypting stored database ciphertext
 *    permanently renders existing encrypted broker tokens (e.g. Fyers tokens in AppSettings)
 *    undecryptable, requiring manual re-authentication.
 * 3. Default safe action (no flags): rotates only non-encryption secrets (CRON_SECRET).
 * 4. Supports both quoted and unquoted KEY=value lines in .env.
 * 5. Fails with non-zero exit code if target keys are missing from .env (no false "Rotated" claims).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs(args = process.argv.slice(2)) {
  const flags = {
    rotateCron: false,
    rotateTokenEncryptionKey: false,
    understandDataLoss: false,
    envPath: '.env',
  };

  for (const arg of args) {
    if (arg === '--cron-secret') {
      flags.rotateCron = true;
    } else if (arg === '--token-encryption-key') {
      flags.rotateTokenEncryptionKey = true;
    } else if (arg === '--i-understand-data-loss') {
      flags.understandDataLoss = true;
    } else if (arg.startsWith('--env-file=')) {
      flags.envPath = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    }
  }

  // Default: if no specific secret specified, target CRON_SECRET only
  if (!flags.rotateCron && !flags.rotateTokenEncryptionKey) {
    flags.rotateCron = true;
  }

  return flags;
}

function rotateSecrets(options = {}) {
  const envPath = options.envPath || '.env';

  if (!fs.existsSync(envPath)) {
    throw new Error(`Target environment file not found: ${envPath}`);
  }

  if (options.rotateTokenEncryptionKey && !options.understandDataLoss) {
    throw new Error(
      'REFUSED: Rotating TOKEN_ENCRYPTION_KEY will permanently orphan all encrypted broker ' +
      'credentials in the database (e.g. Fyers access/refresh tokens in AppSettings). ' +
      'You must re-link the broker after rotation. ' +
      'To proceed and acknowledge data invalidation, pass --i-understand-data-loss.'
    );
  }

  let envContent = fs.readFileSync(envPath, 'utf8');
  const rotatedKeys = [];
  const missingKeys = [];

  const targets = [];
  if (options.rotateCron) {
    // 32-hex-char secret (16 bytes), satisfies production >= 16 chars gate
    const newCronSecret = crypto.randomBytes(16).toString('hex');
    targets.push({ key: 'CRON_SECRET', value: newCronSecret });
  }

  if (options.rotateTokenEncryptionKey && options.understandDataLoss) {
    // 64-hex-char key (32 bytes)
    const newTokenKey = crypto.randomBytes(32).toString('hex');
    targets.push({ key: 'TOKEN_ENCRYPTION_KEY', value: newTokenKey });
  }

  for (const { key, value } of targets) {
    // Matches: KEY=value, KEY="value", KEY='value', with optional whitespace around '='
    const lineRegex = new RegExp(`^(\\s*${key}\\s*=\\s*)["']?.*["']?\\s*$`, 'm');
    if (lineRegex.test(envContent)) {
      envContent = envContent.replace(lineRegex, `$1"${value}"`);
      rotatedKeys.push(key);
    } else {
      missingKeys.push(key);
    }
  }

  if (rotatedKeys.length === 0) {
    throw new Error(
      `No target keys were found or updated in ${envPath}. Target keys: ${targets.map(t => t.key).join(', ')}`
    );
  }

  fs.writeFileSync(envPath, envContent, 'utf8');

  return {
    envPath,
    rotatedKeys,
    missingKeys,
  };
}

if (require.main === module) {
  try {
    const flags = parseArgs();

    if (flags.help) {
      console.log(`
Secrets Rotation Script — CPR Platform

Usage:
  node scripts/rotate_secrets.js [options]

Options:
  --cron-secret                Rotate CRON_SECRET (safe, default action)
  --token-encryption-key       Request rotation of TOKEN_ENCRYPTION_KEY
  --i-understand-data-loss     Required confirmation flag when rotating TOKEN_ENCRYPTION_KEY
  --env-file=<path>            Path to env file (default: .env)
  --help, -h                   Show this help message

Notes:
  - APP_ACCESS_TOKEN is a personal single-operator secret and is intentionally NOT auto-rotated.
  - Rotating TOKEN_ENCRYPTION_KEY invalidates stored broker ciphertext. Re-auth required.
`);
      process.exit(0);
    }

    const result = rotateSecrets(flags);
    console.log(`Successfully rotated in ${result.envPath}: ${result.rotatedKeys.join(', ')}`);
    if (result.missingKeys.length > 0) {
      console.warn(`Warning: Keys not present in ${result.envPath}: ${result.missingKeys.join(', ')}`);
    }
    process.exit(0);
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  rotateSecrets,
};
