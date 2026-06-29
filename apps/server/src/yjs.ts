import type { IncomingMessage } from 'node:http';
import type { Role, Shape } from '@coalesce/board';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as map from 'lib0/map';
import { WebSocket } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import {
  PERSISTENCE_ORIGIN,
  flushSave,
  loadDoc,
  scheduleSave,
} from '~/persistence.ts';

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
  /** Resolves once any persisted snapshot has been loaded into the doc. */
  whenLoaded: Promise<void> = Promise.resolve();

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

    this.on('update', (update: Uint8Array, origin: unknown, doc: Y.Doc) => {
      const shared = doc as SharedDoc;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const buf = encoding.toUint8Array(encoder);
      shared.conns.forEach((_, c) => send(shared, c, buf));
      // Persist real edits, but not the snapshot we just loaded from storage.
      if (origin !== PERSISTENCE_ORIGIN) scheduleSave(shared.name, shared);
    });
  }
}

const docs = new Map<string, SharedDoc>();

function getYDoc(docName: string): SharedDoc {
  return map.setIfUndefined(docs, docName, () => {
    const doc = new SharedDoc(docName);
    // Kick off the load now; setupWSConnection awaits this before handshaking.
    doc.whenLoaded = loadDoc(docName, doc);
    return doc;
  });
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
    // Drop empty rooms so memory tracks live usage. Flush a final snapshot first
    // (flushSave encodes synchronously, so destroying right after is safe).
    if (doc.conns.size === 0) {
      void flushSave(doc.name, doc);
      doc.destroy();
      docs.delete(doc.name);
    }
  }
  conn.close();
}

function onMessage(
  conn: WebSocket,
  doc: SharedDoc,
  message: Uint8Array,
  role: Role,
): void {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case MESSAGE_SYNC: {
        // Mirror syncProtocol.readSyncMessage, but for viewers answer the initial
        // state request (step 1) while silently dropping any document writes
        // (step 2 / update) — read-only access enforced server-side.
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const syncType = decoding.readVarUint(decoder);
        switch (syncType) {
          case syncProtocol.messageYjsSyncStep1:
            syncProtocol.readSyncStep1(decoder, encoder, doc);
            break;
          case syncProtocol.messageYjsSyncStep2:
            if (role !== 'viewer') syncProtocol.readSyncStep2(decoder, doc, conn);
            break;
          case syncProtocol.messageYjsUpdate:
            if (role !== 'viewer') syncProtocol.readUpdate(decoder, doc, conn);
            break;
        }
        // An empty body (length 1 = just the type) means nothing to reply with.
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      }
      case MESSAGE_AWARENESS:
        // Awareness (cursors/presence) is always allowed, even for viewers.
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
export async function setupWSConnection(
  conn: WebSocket,
  _req: IncomingMessage,
  roomName: string,
  role: Role = 'editor',
): Promise<void> {
  conn.binaryType = 'arraybuffer';
  const doc = getYDoc(roomName);
  // Wait for any persisted snapshot to load so the handshake reflects it.
  await doc.whenLoaded;
  doc.conns.set(conn, new Set());

  conn.on('message', (message: ArrayBuffer) =>
    onMessage(conn, doc, new Uint8Array(message), role),
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
