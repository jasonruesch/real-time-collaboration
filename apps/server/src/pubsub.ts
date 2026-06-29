import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { env } from '~/env.ts';

/**
 * Cross-instance room fan-out over Redis pub/sub. Each server instance
 * publishes a room's Yjs document and awareness updates to a per-room channel
 * and applies updates published by *other* instances to its local copy, so two
 * users on different machines see each other's edits. When REDIS_URL is unset
 * everything no-ops and the server is single-instance (in-process broadcast).
 */

/** Origin tag for updates applied from a remote instance — never re-published. */
export const REMOTE_ORIGIN = 'pubsub-remote';

/** Unique per-process id, used to ignore our own published messages. */
export const instanceId = randomUUID();

export const pubsubEnabled = Boolean(env.REDIS_URL);

const CHANNEL_PREFIX = 'coalesce:room:';
const ID_LEN = 36; // randomUUID() is always 36 ASCII chars

type Kind = 'update' | 'awareness';
export interface RoomMessage {
  from: string;
  kind: Kind;
  data: Uint8Array;
}
type RoomHandler = (msg: RoomMessage) => void;

const handlers = new Map<string, RoomHandler>();
const pub: Redis | null = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;
const sub: Redis | null = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;

function encode(kind: Kind, data: Uint8Array): Buffer {
  const header = Buffer.alloc(1 + ID_LEN);
  header[0] = kind === 'update' ? 0 : 1;
  header.write(instanceId, 1, 'ascii');
  return Buffer.concat([header, Buffer.from(data)]);
}

function decode(buf: Buffer): RoomMessage {
  return {
    kind: buf[0] === 0 ? 'update' : 'awareness',
    from: buf.toString('ascii', 1, 1 + ID_LEN),
    data: new Uint8Array(buf.subarray(1 + ID_LEN)),
  };
}

if (sub) {
  // messageBuffer keeps the payload binary (the framed Yjs update bytes).
  sub.on('messageBuffer', (channel: Buffer, message: Buffer) => {
    const room = channel.toString().slice(CHANNEL_PREFIX.length);
    const handler = handlers.get(room);
    if (!handler) return;
    const msg = decode(message);
    if (msg.from === instanceId) return; // ignore our own echo
    handler(msg);
  });
}

export function publishUpdate(room: string, data: Uint8Array): void {
  void pub?.publish(CHANNEL_PREFIX + room, encode('update', data));
}

export function publishAwareness(room: string, data: Uint8Array): void {
  void pub?.publish(CHANNEL_PREFIX + room, encode('awareness', data));
}

export function subscribeRoom(room: string, handler: RoomHandler): void {
  if (!sub) return;
  handlers.set(room, handler);
  void sub.subscribe(CHANNEL_PREFIX + room);
}

export function unsubscribeRoom(room: string): void {
  if (!sub) return;
  handlers.delete(room);
  void sub.unsubscribe(CHANNEL_PREFIX + room);
}

export async function closePubsub(): Promise<void> {
  await Promise.all([pub?.quit(), sub?.quit()]);
}
