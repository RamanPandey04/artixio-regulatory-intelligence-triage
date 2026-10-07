/** Prepare a separate local PostgreSQL schema for API tests. */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

// Refuse remote hosts before creating a schema or running migrations.
export default async function setup(): Promise<void> {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is required for API tests.');
  const url = new URL(base);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('API tests only run against a local PostgreSQL host.');
  }

  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  try {
    await admin.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS "api_test"');
  } finally {
    await admin.$disconnect();
  }

  url.searchParams.set('schema', 'api_test');
  const dbDir = resolve(import.meta.dirname, '../../../packages/db');
  const prismaCli = resolve(dbDir, 'node_modules/prisma/build/index.js');
  // Tests use the same checked-in migrations as the application schema.
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: dbDir,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
    timeout: 60_000,
  });
}
