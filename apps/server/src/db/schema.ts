import { customType, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Drizzle schema for durable storage. Tables are created idempotently at boot by
 * `ensureSchema()` (see ./client.ts) so a fresh Postgres needs no separate
 * migration step; `drizzle-kit` is still available for generating real
 * migrations as the schema grows.
 */

/** Raw binary column for the encoded `Y.Doc` state (`Y.encodeStateAsUpdate`). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/** One row per board (room id), holding its latest CRDT snapshot. */
export const boards = pgTable('boards', {
  id: text('id').primaryKey(),
  state: bytea('state'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
