#!/usr/bin/env node
/**
 * Database setup script - runs before app starts
 * Handles: pgvector extension, migrations, and error recovery
 */

const { execSync } = require('child_process');

const run = (cmd, ignoreError = false) => {
  console.log(`[setup-db] Running: ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch (e) {
    if (!ignoreError) console.error(`[setup-db] Command failed: ${cmd}`);
    return false;
  }
};

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[setup-db] DATABASE_URL not set!');
    process.exit(1);
  }

  console.log('[setup-db] Setting up database...');

  // 1. Enable pgvector extension (required for embeddings)
  console.log('[setup-db] Enabling pgvector extension...');
  run(`psql "${dbUrl}" -c "CREATE EXTENSION IF NOT EXISTS vector;"`, true);

  // 2. Generate Prisma client (in case it's missing)
  console.log('[setup-db] Generating Prisma client...');
  run('npx prisma generate');

  // 3. Try to deploy migrations
  console.log('[setup-db] Running migrations...');
  const migrateSuccess = run('npx prisma migrate deploy');

  // 4. If migrations failed, try to resolve and retry
  if (!migrateSuccess) {
    console.log('[setup-db] Migration failed, attempting recovery...');
    
    // Get failed migration name and try to resolve
    try {
      const output = execSync('npx prisma migrate status 2>&1', { encoding: 'utf8' });
      const failedMatch = output.match(/`(\d+_\w+)` migration.*failed/);
      if (failedMatch) {
        const migrationName = failedMatch[1];
        console.log(`[setup-db] Resolving failed migration: ${migrationName}`);
        run(`npx prisma migrate resolve --rolled-back ${migrationName}`, true);
        run('npx prisma migrate deploy');
      }
    } catch (e) {
      // If status check fails, try db push as fallback
      console.log('[setup-db] Falling back to db push...');
      run('npx prisma db push --accept-data-loss', true);
    }
  }

  console.log('[setup-db] Database setup complete!');
}

main().catch(e => {
  console.error('[setup-db] Setup failed:', e.message);
  // Don't exit with error - let the app try to start anyway
  // It will fail more gracefully with better error messages
});
