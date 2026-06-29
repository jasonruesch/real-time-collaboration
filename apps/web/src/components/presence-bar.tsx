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
export function PresenceBar({ peers, selfId }: { peers: Peer[]; selfId: number }) {
  return (
    <div className="flex items-center -space-x-2">
      {peers.map((peer) => {
        const name = peer.user?.name ?? 'Guest';
        const label = peer.clientId === selfId ? `${name} (you)` : name;
        return (
          <Tooltip key={peer.clientId}>
            <TooltipTrigger asChild>
              <span
                className="inline-flex size-7 items-center justify-center rounded-full border-2 border-canvas text-xs font-semibold text-white"
                style={{ backgroundColor: peer.user?.color ?? '#888' }}
              >
                {initials(name)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
