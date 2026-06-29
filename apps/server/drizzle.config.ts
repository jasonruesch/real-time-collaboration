import { defineConfig } from 'drizzle-kit';

// Tables are created idempotently at boot by ensureSchema(), so migrations are
// optional. This config lets `pnpm db:generate` / `db:push` manage real
// migrations against DATABASE_URL when you want them.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
