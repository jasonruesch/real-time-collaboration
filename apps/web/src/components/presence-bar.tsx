import { Tooltip, TooltipContent, TooltipTrigger } from '@jasonruesch/react';
import type { Peer } from '~/lib/use-presence';

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Stacked avatars of everyone currently in the room (self included). */
export function PresenceBar({
  peers,
  selfId,
  followId,
  onFollow,
}: {
  peers: Peer[];
  selfId: number;
  followId: number | null;
  onFollow: (clientId: number) => void;
}) {
  return (
    <div className="flex items-center -space-x-2">
      {peers.map((peer) => {
        const name = peer.user?.name ?? 'Guest';
        const isSelf = peer.clientId === selfId;
        const following = peer.clientId === followId;
        const label = isSelf
          ? `${name} (you)`
          : following
            ? `Following ${name} — click to stop`
            : `Click to follow ${name}`;
        return (
          <Tooltip key={peer.clientId}>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={isSelf}
                aria-label={label}
                onClick={() => onFollow(peer.clientId)}
                className={
                  'inline-flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold text-white transition' +
                  (following ? ' border-accent' : ' border-canvas') +
                  (isSelf ? '' : ' cursor-pointer hover:z-10')
                }
                style={{ backgroundColor: peer.user?.color ?? '#888' }}
              >
                {initials(name)}
              </button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
