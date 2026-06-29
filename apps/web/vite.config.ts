/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import reactRouterNext from '@evolonix/react-router-next/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The filesystem-router plugin must run before @vitejs/plugin-react so its
// virtual modules are registered before React Fast Refresh transforms them.
// In dev the server runs on :3000; proxy /api there and /yjs as a WebSocket so
// the browser talks to one origin (no CORS) — the same single-origin model used
// in production, where the server serves the built SPA itself.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [reactRouterNext(), react(), tailwindcss()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // A single copy of React (tests) and of Yjs (it warns loudly on duplicates).
    dedupe: ['react', 'react-dom', 'yjs'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/yjs': { target: 'ws://localhost:3000', ws: true },
    },
  },
  preview: { port: 4173 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    // Force a non-production env so React loads its development build (which
    // exports `act`) even when the host shell pins NODE_ENV=production.
    env: { NODE_ENV: 'test' },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.d.ts'],
    },
  },
});
