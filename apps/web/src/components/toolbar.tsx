import { PALETTE } from '@coalesce/board';
import { Button, IconButton, Tooltip, TooltipContent, TooltipTrigger } from '@jasonruesch/react';
import {
  Check,
  Circle,
  MousePointer2,
  Pencil,
  Share2,
  Square,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { type ComponentType, useState } from 'react';
import { PresenceBar } from '~/components/presence-bar';
import type { ConnectionStatus } from '~/lib/use-room';
import type { Peer } from '~/lib/use-presence';

export type Tool = 'select' | 'rect' | 'ellipse' | 'note' | 'pen';

const TOOLS: { tool: Tool; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { tool: 'select', label: 'Select & move', Icon: MousePointer2 },
  { tool: 'rect', label: 'Rectangle', Icon: Square },
  { tool: 'ellipse', label: 'Ellipse', Icon: Circle },
  { tool: 'note', label: 'Sticky note', Icon: StickyNote },
  { tool: 'pen', label: 'Freehand', Icon: Pencil },
];

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  disconnected: 'Offline — edits will sync on reconnect',
};

export interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  color: string;
  onColorChange: (color: string) => void;
  hasSelection: boolean;
  onDeleteSelected: () => void;
  onClear: () => void;
  status: ConnectionStatus;
  peers: Peer[];
  selfId: number;
}

export function Toolbar(props: ToolbarProps) {
  const [copied, setCopied] = useState(false);

  function share() {
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
      <div className="flex items-center gap-1">
        {TOOLS.map(({ tool, label, Icon }) => (
          <Tooltip key={tool}>
            <TooltipTrigger asChild>
              <IconButton
                variant={props.tool === tool ? 'primary' : 'ghost'}
                aria-label={label}
                aria-pressed={props.tool === tool}
                onClick={() => props.onToolChange(tool)}
              >
                <Icon size={18} />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="Color">
        {PALETTE.map((swatch) => (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={props.color === swatch}
            aria-label={`Color ${swatch}`}
            onClick={() => props.onColorChange(swatch)}
            className={
              'size-5 rounded-full ring-offset-2 ring-offset-canvas transition' +
              (props.color === swatch ? ' ring-2 ring-fg' : '')
            }
            style={{ backgroundColor: swatch }}
          />
        ))}
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              variant="ghost"
              aria-label="Delete selected"
              disabled={!props.hasSelection}
              onClick={props.onDeleteSelected}
            >
              <Trash2 size={18} />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>Delete selected</TooltipContent>
        </Tooltip>
        <Button variant="ghost" onClick={props.onClear}>
          Clear board
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span
          className="inline-flex items-center gap-1.5 text-xs text-muted"
          title={STATUS_LABEL[props.status]}
        >
          <span
            className={
              'size-2 rounded-full ' +
              (props.status === 'connected'
                ? 'bg-emerald-500'
                : props.status === 'connecting'
                  ? 'bg-amber-500'
                  : 'bg-red-500')
            }
            aria-hidden
          />
          {STATUS_LABEL[props.status]}
        </span>
        <PresenceBar peers={props.peers} selfId={props.selfId} />
        <Button variant="secondary" onClick={share}>
          {copied ? <Check size={18} /> : <Share2 size={18} />}
          {copied ? 'Copied' : 'Share'}
        </Button>
      </div>
    </div>
  );
}
