import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { WebSocketServer } from 'ws';
import { ensureSchema } from '~/db/client.ts';
import { env } from '~/env.ts';
import { getRoomSnapshot, getStats, setupWSConnection } from '~/yjs.ts';

const WS_PREFIX = '/yjs/';

/**
 * Build the fully-wired server. Exported (rather than started) so tests can
 * drive it without binding a port. A single `ws` server rides on Fastify's
 * underlying HTTP server, handling the `/yjs/<room>` upgrade; in production the
 * same origin also serves the built SPA.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
    disableRequestLogging: env.NODE_ENV === 'test',
  });

  // Bootstrap durable storage (no-op when DATABASE_URL is unset).
  await ensureSchema();

  app.get('/api/health', async () => ({ status: 'ok', ...getStats() }));

  // Read-only snapshot of a live room — proves the server understands the same
  // board document model the client edits (shared via @coalesce/board).
  app.get<{ Params: { roomId: string } }>(
    '/api/rooms/:roomId',
    async (request) => getRoomSnapshot(request.params.roomId),
  );

  // The Yjs WebSocket sync backend. `noServer` mode lets us route only the
  // `/yjs/<room>` upgrades here and leave the rest to Fastify.
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (socket, request) => {
    const path = (request.url ?? '').split('?')[0];
    const room = decodeURIComponent(path.slice(WS_PREFIX.length)) || 'default';
    setupWSConnection(socket, request, room).catch((err) => {
      app.log.error(err, 'failed to set up ws connection');
      socket.close();
    });
  });

  app.server.on('upgrade', (request, socket, head) => {
    if (!request.url || !request.url.startsWith(WS_PREFIX)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) =>
      wss.emit('connection', ws, request),
    );
  });

  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  // In production the server also serves the built SPA from a single origin.
  if (env.WEB_DIST && existsSync(env.WEB_DIST)) {
    await app.register(fastifyStatic, { root: env.WEB_DIST });
    app.setNotFoundHandler((request, reply) => {
      // Unknown API paths are real 404s; everything else is a client route, so
      // hand back index.html and let the SPA router resolve it.
      if (request.method !== 'GET' || request.url.startsWith('/api')) {
        return reply.code(404).send({ message: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
