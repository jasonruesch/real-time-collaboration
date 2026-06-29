import { Spinner } from '@jasonruesch/react';
import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import type { RouteProps } from 'virtual:react-router-next/board/[roomId]';
import { getToken, storeToken } from '~/lib/auth';

// Lazy-load the whiteboard and its dependency tree (Yjs, the WebSocket provider,
// the editing UI) so it splits into its own chunk. The router eagerly bundles
// every page module, so without this the landing page would ship all of Yjs;
// this way the heavy chunk loads only when a board is actually opened.
const Whiteboard = lazy(() =>
  import('~/components/whiteboard').then((m) => ({ default: m.Whiteboard })),
);

/** A single collaborative board, keyed by the room id in the URL. */
export default function BoardPage({ params }: RouteProps) {
  const roomId = params.roomId;
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get('t');

  // A token arriving via a share link (?t=) is persisted so the role survives
  // reloads; otherwise fall back to any token already stored for this room.
  useEffect(() => {
    if (urlToken) storeToken(roomId, urlToken);
  }, [roomId, urlToken]);
  const token = urlToken ?? getToken(roomId);

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner label="Loading board…" />
        </div>
      }
    >
      <Whiteboard roomId={roomId} token={token} />
    </Suspense>
  );
}
