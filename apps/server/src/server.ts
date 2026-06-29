import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Role } from '@coalesce/board';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { WebSocketServer } from 'ws';
import { signRoomToken, verifyRoomToken } from '~/auth.ts';
import { db, ensureSchema, rooms } from '~/db/client.ts';
import { env } from '~/env.ts';
import { closePubsub } from '~/pubsub.ts';
import { getRoomSnapshot, getStats, setupWSConnection } from '~/yjs.ts';

const WS_PREFIX = '/yjs/';

/** Generate a short, URL-friendly room id. */
function newRoomId(): string {
  return randomUUID().split('-')[0];
}

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

  // Create a board: record it (when a DB is configured) and mint an owner token
  // that lets the creator generate share links.
  app.post('/api/rooms', async () => {
    const roomId = newRoomId();
    if (db) await db.insert(rooms).values({ id: roomId }).onConflictDoNothing();
    const token = await signRoomToken(roomId, 'owner');
    return { roomId, token };
  });

  // Mint an editor/viewer share link, gated by a valid owner token for the room.
  app.post<{ Params: { roomId: string }; Body: { role?: Role } }>(
    '/api/rooms/:roomId/links',
    async (request, reply) => {
      const header = request.headers.authorization;
      const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
      const claims = bearer ? await verifyRoomToken(bearer) : null;
      if (!claims || claims.role !== 'owner' || claims.room !== request.params.roomId) {
        return reply.code(403).send({ message: 'Owner token required' });
      }
      const role: Role = request.body?.role === 'viewer' ? 'viewer' : 'editor';
      const token = await signRoomToken(request.params.roomId, role);
      return { token, role };
    },
  );

  // The Yjs WebSocket sync backend. `noServer` mode lets us route only the
  // `/yjs/<room>` upgrades here and leave the rest to Fastify.
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '', 'http://localhost');
    const room = decodeURIComponent(url.pathname.slice(WS_PREFIX.length)) || 'default';
    const handle = async () => {
      // Default to editor (open/legacy access); a valid token for *this* room
      // sets the granted role. A foreign/invalid token never elevates access.
      let role: Role = 'editor';
      const token = url.searchParams.get('t');
      if (token) {
        const claims = await verifyRoomToken(token);
        if (claims && claims.room === room) role = claims.role;
      }
      await setupWSConnection(socket, request, room, role);
    };
    handle().catch((err) => {
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
    await closePubsub();
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
