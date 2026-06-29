import type { Shape } from '@coalesce/board';
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
  awareness: Awareness;
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
export function useRoom(roomId: string): { room: Room | null; status: ConnectionStatus } {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(wsBase(), roomId, doc);
    const shapes = doc.getMap<Shape>('shapes');
    // Instantiating a per-room external resource (Y.Doc + provider) in an effect
    // and exposing it via state is the StrictMode-safe pattern — the effect's
    // cleanup tears the old connection down before a new roomId re-runs it. The
    // one synchronous setState here is intentional, not a cascading-render bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoom({ doc, provider, shapes, awareness: provider.awareness });

    const onStatus = (event: { status: ConnectionStatus }) =>
      setStatus(event.status);
    provider.on('status', onStatus);

    return () => {
      provider.off('status', onStatus);
      provider.destroy(); // disconnects and destroys the awareness instance
      doc.destroy();
      setRoom(null);
      setStatus('connecting');
    };
  }, [roomId]);

  return { room, status };
}
