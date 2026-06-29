import { defineConfig } from 'tsup';

// Bundle the server to ESM. The workspace `@coalesce/board` package exports raw
// .ts, so it must be inlined (noExternal); everything else (fastify, yjs, ws, …)
// stays external and is resolved from node_modules in the production image.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  noExternal: ['@coalesce/board'],
});
