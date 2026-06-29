import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { signRoomToken } from '~/auth.ts';
import { buildApp } from '~/server.ts';

/**
 * End-to-end check of the read-only enforcement: a viewer connection must
 * receive the document (reads work) but never write to it (writes dropped
 * server-side). Speaks the Yjs sync protocol directly over a `ws` client.
 */

const MESSAGE_SYNC = 0;

type Client = { ws: WebSocket; doc: Y.Doc; shapes: Y.Map<unknown> };

function connect(port: number, room: string, token?: string): Promise<Client> {
  const query = token ? `?t=${token}` : '';
  const ws = new WebSocket(`ws://localhost:${port}/yjs/${room}${query}`);
  ws.binaryType = 'arraybuffer';
  const doc = new Y.Doc();
  const shapes = doc.getMap('shapes');

  ws.on('message', (data: ArrayBuffer) => {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    if (decoding.readVarUint(decoder) !== MESSAGE_SYNC) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    // Apply with `ws` as the origin so our own update handler won't echo it back.
    syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
    if (encoding.length(encoder) > 1) ws.send(encoding.toUint8Array(encoder));
  });

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === ws) return; // came from the server; don't bounce it back
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    ws.send(encoding.toUint8Array(encoder));
  });

  return new Promise((resolve) => {
    ws.on('open', () => {
      // Kick off the sync handshake.
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, doc);
      ws.send(encoding.toUint8Array(encoder));
      resolve({ ws, doc, shapes });
    });
  });
}

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return predicate();
}

describe('read-only enforcement over WebSocket', () => {
  let port: number;
  const app = buildApp();
  let server: Awaited<typeof app>;

  beforeAll(async () => {
    server = await app;
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterAll(async () => {
    await server.close();
  });

  it('lets a viewer read but not write', async () => {
    const room = `acc-${Math.random().toString(36).slice(2)}`;
    const viewerToken = await signRoomToken(room, 'viewer');

    const editor = await connect(port, room); // no token → editor
    const viewer = await connect(port, room, viewerToken);

    // Editor writes → viewer should receive it (reads work).
    editor.shapes.set('e1', { id: 'e1', type: 'rect', x: 0, y: 0, w: 10, h: 10 });
    expect(await waitFor(() => viewer.shapes.has('e1'))).toBe(true);

    // Viewer writes → editor must NOT receive it (writes dropped server-side).
    viewer.shapes.set('v1', { id: 'v1', type: 'rect', x: 1, y: 1, w: 5, h: 5 });
    const leaked = await waitFor(() => editor.shapes.has('v1'), 400);
    expect(leaked).toBe(false);

    editor.ws.close();
    viewer.ws.close();
  });
});
