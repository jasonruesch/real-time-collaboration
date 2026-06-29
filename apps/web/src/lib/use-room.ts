import type { Comment, Shape } from '@coalesce/board';
import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface Room {
  doc: Y.Doc;
  provider: WebsocketProvider;
  /** Shapes keyed by id — last-writer-wins per shape, conflict-free across peers. */
  shapes: Y.Map<Shape>;
  /** Pinned comments (and threaded replies) keyed by id. */
  comments: Y.Map<Comment>;
  awareness: Awareness;
  /** Per-user undo history — tracks only this client's local edits. */
  undoManager: Y.UndoManager;
}

/** The same-origin WebSocket base; Vite proxies `/yjs` to the server in dev. */
function wsBase(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/yjs`;
}

/**
 * Connect to a room's shared Yjs document over WebSocket. The provider buffers
 * local edits while offline and auto-reconnects; on reconnect the divergent
 * states merge automatically. Tears everything down on room change/unmount.
 */
export function useRoom(
  roomId: string,
  token?: string | null,
): { room: Room | null; status: ConnectionStatus } {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const doc = new Y.Doc();
    // The token (when present) rides along as `?t=` so the server can grant the
    // matching role; an absent/invalid token falls back to open editor access.
    const provider = new WebsocketProvider(wsBase(), roomId, doc, {
      params: token ? { t: token } : {},
    });
    const shapes = doc.getMap<Shape>('shapes');
    const comments = doc.getMap<Comment>('comments');
    // Default trackedOrigins ({null}) captures this client's own edits while
    // ignoring remote updates (which arrive tagged with the provider), giving
    // per-user undo/redo for free. Scope covers both shapes and comments.
    const undoManager = new Y.UndoManager([shapes, comments]);
    // Instantiating a per-room external resource (Y.Doc + provider) in an effect
    // and exposing it via state is the StrictMode-safe pattern — the effect's
    // cleanup tears the old connection down before a new roomId re-runs it. The
    // one synchronous setState here is intentional, not a cascading-render bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoom({ doc, provider, shapes, comments, awareness: provider.awareness, undoManager });

    const onStatus = (event: { status: ConnectionStatus }) =>
      setStatus(event.status);
    provider.on('status', onStatus);

    return () => {
      provider.off('status', onStatus);
      undoManager.destroy();
      provider.destroy(); // disconnects and destroys the awareness instance
      doc.destroy();
      setRoom(null);
      setStatus('connecting');
    };
  }, [roomId, token]);

  return { room, status };
}
