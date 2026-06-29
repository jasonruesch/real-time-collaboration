import { eq } from 'drizzle-orm';
import * as Y from 'yjs';
import { boards, db } from '~/db/client.ts';

/**
 * Durable persistence for room documents, mirroring the y-leveldb
 * bindState/writeState pattern: load a room's CRDT snapshot from Postgres when
 * it's first opened, and write it back (debounced) as it changes. When no
 * database is configured (`db === null`) every function is a no-op.
 */

/** Origin tag for updates applied while loading, so we don't re-persist them. */
export const PERSISTENCE_ORIGIN = 'persistence';

const DEBOUNCE_MS = 3_000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const persistenceEnabled = db !== null;

/** Apply any stored snapshot into `doc`. Call before the sync handshake. */
export async function loadDoc(name: string, doc: Y.Doc): Promise<void> {
  if (!db) return;
  try {
    const rows = await db.select().from(boards).where(eq(boards.id, name)).limit(1);
    const state = rows[0]?.state;
    if (state && state.length > 0) {
      Y.applyUpdate(doc, state, PERSISTENCE_ORIGIN);
    }
  } catch (err) {
    console.error(`persistence: failed to load room "${name}"`, err);
  }
}

/** Write the current full state of `doc` to Postgres (upsert). */
async function saveDoc(name: string, doc: Y.Doc): Promise<void> {
  if (!db) return;
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  try {
    await db
      .insert(boards)
      .values({ id: name, state })
      .onConflictDoUpdate({ target: boards.id, set: { state, updatedAt: new Date() } });
  } catch (err) {
    console.error(`persistence: failed to save room "${name}"`, err);
  }
}

/** Schedule a debounced save; coalesces a burst of edits into one write. */
export function scheduleSave(name: string, doc: Y.Doc): void {
  if (!db) return;
  const existing = timers.get(name);
  if (existing) clearTimeout(existing);
  timers.set(
    name,
    setTimeout(() => {
      timers.delete(name);
      void saveDoc(name, doc);
    }, DEBOUNCE_MS),
  );
}

/**
 * Flush a pending save immediately. Encodes the document synchronously before
 * returning, so it's safe to `doc.destroy()` right after calling this.
 */
export function flushSave(name: string, doc: Y.Doc): Promise<void> {
  const existing = timers.get(name);
  if (existing) {
    clearTimeout(existing);
    timers.delete(name);
  }
  return saveDoc(name, doc);
}
