import type { Peer } from '~/lib/use-presence';

/** Renders remote peers' live cursors over the board surface. */
export function CursorsLayer({ peers }: { peers: Peer[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {peers.map((peer) =>
        peer.cursor ? (
          <div
            key={peer.clientId}
            className="absolute -translate-y-1 will-change-transform"
            style={{ left: peer.cursor.x, top: peer.cursor.y }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path
                d="M2 2 L2 14 L6 10 L9 16 L11 15 L8 9 L14 9 Z"
                fill={peer.user?.color ?? '#888'}
                stroke="white"
                strokeWidth="1"
              />
            </svg>
            <span
              className="ml-3 inline-block rounded px-1.5 py-0.5 text-xs font-medium text-white shadow-sm"
              style={{ backgroundColor: peer.user?.color ?? '#888' }}
            >
              {peer.user?.name ?? 'Guest'}
            </span>
          </div>
        ) : null,
      )}
    </div>
  );
}
