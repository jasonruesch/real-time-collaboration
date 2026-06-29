import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '~/env.ts';
import * as schema from '~/db/schema.ts';

/**
 * Optional Postgres connection. When `DATABASE_URL` is unset both `sql` and `db`
 * are `null` and every persistence call becomes a no-op, so local dev and tests
 * run fully in memory with zero config. When set, `db` is the type-safe Drizzle
 * client and `sql` is the raw porsager driver (used for idempotent DDL).
 */
export const sql = env.DATABASE_URL ? postgres(env.DATABASE_URL) : null;
export const db = sql ? drizzle(sql, { schema }) : null;

export { boards, rooms } from '~/db/schema.ts';

/**
 * Create tables if they don't exist. Idempotent and safe to run on every boot,
 * so a freshly-provisioned database self-bootstraps without a migration step.
 */
export async function ensureSchema(): Promise<void> {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS boards (
      id text PRIMARY KEY,
      state bytea,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS rooms (
      id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}
