import type { IncomingMessage } from 'node:http';
import type { Shape } from '@coalesce/board';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as map from 'lib0/map';
import { WebSocket } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

/**
 * In-memory Yjs sync server. This is a TypeScript port of the canonical
 * `y-websocket` server utilities (github.com/yjs/y-websocket): one shared
 * `Y.Doc` per room, the binary sync protocol (`y-protocols/sync`) for document
 * updates, and `y-protocols/awareness` for ephemeral presence (cursors,
 * participants). State lives in memory — fine for a single Fly machine; a
 * persistence/clustering layer would slot in at `closeConn` and `getYDoc`.
 */

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const PING_TIMEOUT = 30_000;

/** A room: a `Y.Doc` plus its connections and awareness. */
class SharedDoc extends Y.Doc {
  name: string;
  /** Each connection → the set of awareness client ids it controls. */
  conns = new Map<WebSocket, Set<number>>();
  awareness: awarenessProtocol.Awareness;

  constructor(name: string) {
    super({ gc: true });
    this.name = name;
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.awareness.on(
      'update',
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        conn: WebSocket | null,
      ) => {
        const changed = added.concat(updated, removed);
        if (conn !== null) {
          const controlled = this.conns.get(conn);
          if (controlled !== undefined) {
            added.forEach((id) => controlled.add(id));
            removed.forEach((id) => controlled.delete(id));
          }
        }
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
        );
        const buf = encoding.toUint8Array(encoder);
        this.conns.forEach((_, c) => send(this, c, buf));
      },
    );

    this.on('update', (update: Uint8Array, _origin: unknown, doc: Y.Doc) => {
      const shared = doc as SharedDoc;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const buf = encoding.toUint8Array(encoder);
      shared.conns.forEach((_, c) => send(shared, c, buf));
    });
  }
}

const docs = new Map<string, SharedDoc>();

function getYDoc(docName: string): SharedDoc {
  return map.setIfUndefined(docs, docName, () => new SharedDoc(docName));
}

function send(doc: SharedDoc, conn: WebSocket, message: Uint8Array): void {
  if (conn.readyState !== WebSocket.CONNECTING && conn.readyState !== WebSocket.OPEN) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message, (err) => err != null && closeConn(doc, conn));
  } catch {
    closeConn(doc, conn);
  }
}

function closeConn(doc: SharedDoc, conn: WebSocket): void {
  const controlled = doc.conns.get(conn);
  if (controlled !== undefined) {
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlled), null);
    // Drop empty rooms so memory tracks live usage.
    if (doc.conns.size === 0) {
      doc.destroy();
      docs.delete(doc.name);
    }
  }
  conn.close();
}

function onMessage(conn: WebSocket, doc: SharedDoc, message: Uint8Array): void {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case MESSAGE_SYNC:
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        // An empty body (length 1 = just the type) means nothing to reply with.
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case MESSAGE_AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
        break;
    }
  } catch (err) {
    console.error('yjs message error', err);
  }
}

/** Wire a freshly-upgraded WebSocket into its room and run the sync handshake. */
export function setupWSConnection(
  conn: WebSocket,
  _req: IncomingMessage,
  roomName: string,
): void {
  conn.binaryType = 'arraybuffer';
  const doc = getYDoc(roomName);
  doc.conns.set(conn, new Set());

  conn.on('message', (message: ArrayBuffer) =>
    onMessage(conn, doc, new Uint8Array(message)),
  );

  // Keepalive: drop a connection that misses a ping/pong cycle.
  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) closeConn(doc, conn);
      clearInterval(pingInterval);
    } else if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, PING_TIMEOUT);
  conn.on('pong', () => {
    pongReceived = true;
  });
  conn.on('close', () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });

  // Handshake: sync step 1, then push current awareness state to the newcomer.
  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));

    const states = doc.awareness.getStates();
    if (states.size > 0) {
      const encoder2 = encoding.createEncoder();
      encoding.writeVarUint(encoder2, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder2,
        awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(states.keys())),
      );
      send(doc, conn, encoding.toUint8Array(encoder2));
    }
  }
}

/** Read-only snapshot of a live room, used by the REST endpoint. */
export function getRoomSnapshot(
  roomName: string,
): { exists: boolean; clients: number; shapes: Shape[] } {
  const doc = docs.get(roomName);
  if (!doc) return { exists: false, clients: 0, shapes: [] };
  const shapes = Array.from(doc.getMap<Shape>('shapes').values());
  return { exists: true, clients: doc.conns.size, shapes };
}

/** Aggregate stats for the health endpoint. */
export function getStats(): { rooms: number; connections: number } {
  let connections = 0;
  docs.forEach((doc) => (connections += doc.conns.size));
  return { rooms: docs.size, connections };
}
