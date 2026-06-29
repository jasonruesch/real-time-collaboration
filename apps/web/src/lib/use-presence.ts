import type { Presence } from '@coalesce/board';
import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';

export interface Peer extends Partial<Presence> {
  clientId: number;
}

/** Subscribe to awareness state — the live roster of peers and their cursors. */
export function usePresence(awareness: Awareness | undefined): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    if (!awareness) return;
    const update = () => {
      const next: Peer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const s = state as Partial<Presence>;
        next.push({ clientId, user: s.user, cursor: s.cursor });
      });
      setPeers(next);
    };
    update();
    awareness.on('change', update);
    return () => awareness.off('change', update);
  }, [awareness]);

  return peers;
}
