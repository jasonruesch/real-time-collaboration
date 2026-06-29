import { z } from 'zod';

// Load apps/server/.env in development. In production (Docker/Fly) there is no
// .env file and the variables come from the real environment, so a missing file
// is expected — swallow the error.
try {
  process.loadEnvFile();
} catch {
  // no .env file present
}

/**
 * Validated process environment. Fails fast at boot if a variable is malformed,
 * so misconfiguration surfaces immediately rather than as a runtime error later.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  // Absolute path to the built web client to serve as static files. When unset,
  // the server runs ws-only (the Vite dev server serves the client in dev).
  WEB_DIST: z.string().optional(),
  // Postgres connection string for durable board persistence. When unset the
  // server keeps rooms in memory only (zero-config local dev); set it to make
  // boards survive restarts and empty rooms.
  DATABASE_URL: z.string().optional(),
  // HMAC secret for signing room share-link tokens. Required in production; in
  // dev an insecure fallback is used so the feature works without setup.
  AUTH_SECRET: z.string().optional(),
  // Redis connection string for cross-instance room fan-out. When unset the
  // server runs single-instance (in-process broadcast only).
  REDIS_URL: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
