import { PALETTE, type Role, canEdit } from '@coalesce/board';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@jasonruesch/react';
import {
  BringToFront,
  Check,
  Circle,
  Download,
  Eye,
  MessageCircle,
  MousePointer2,
  Pencil,
  Redo2,
  SendToBack,
  Share2,
  Square,
  StickyNote,
  Trash2,
  Undo2,
} from 'lucide-react';
import { type ComponentType, useState } from 'react';
import { PresenceBar } from '~/components/presence-bar';
import { getToken } from '~/lib/auth';
import type { ConnectionStatus } from '~/lib/use-room';
import type { Peer } from '~/lib/use-presence';

export type Tool = 'select' | 'rect' | 'ellipse' | 'note' | 'pen' | 'comment';

const TOOLS: { tool: Tool; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { tool: 'select', label: 'Select & move', Icon: MousePointer2 },
  { tool: 'rect', label: 'Rectangle', Icon: Square },
  { tool: 'ellipse', label: 'Ellipse', Icon: Circle },
  { tool: 'note', label: 'Sticky note', Icon: StickyNote },
  { tool: 'pen', label: 'Freehand', Icon: Pencil },
  { tool: 'comment', label: 'Comment', Icon: MessageCircle },
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
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onExport: (format: 'png' | 'svg') => void;
  status: ConnectionStatus;
  peers: Peer[];
  selfId: number;
  followId: number | null;
  onFollow: (clientId: number) => void;
  role: Role;
  roomId: string;
}

export function Toolbar(props: ToolbarProps) {
  const [copied, setCopied] = useState(false);
  const editable = canEdit(props.role);
  const isOwner = props.role === 'owner';

  function flashCopied() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function copyCurrentLink() {
    void navigator.clipboard?.writeText(window.location.href).then(flashCopied);
  }

  // Owners mint a fresh capability link (edit or view) and copy it.
  async function copyRoleLink(linkRole: 'editor' | 'viewer') {
    try {
      const res = await fetch(`/api/rooms/${props.roomId}/links`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${getToken(props.roomId) ?? ''}`,
        },
        body: JSON.stringify({ role: linkRole }),
      });
      if (!res.ok) return;
      const { token } = (await res.json()) as { token: string };
      const url = `${window.location.origin}/board/${props.roomId}?t=${token}`;
      await navigator.clipboard?.writeText(url);
      flashCopied();
    } catch {
      // Network/clipboard failure — nothing copied; leave the UI unchanged.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
      {editable && (
        <>
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
                  aria-label="Undo"
                  disabled={!props.canUndo}
                  onClick={props.onUndo}
                >
                  <Undo2 size={18} />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Undo (⌘Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="ghost"
                  aria-label="Redo"
                  disabled={!props.canRedo}
                  onClick={props.onRedo}
                >
                  <Redo2 size={18} />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Redo (⇧⌘Z)</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="ghost"
                  aria-label="Bring to front"
                  disabled={!props.hasSelection}
                  onClick={props.onBringToFront}
                >
                  <BringToFront size={18} />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Bring to front</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  variant="ghost"
                  aria-label="Send to back"
                  disabled={!props.hasSelection}
                  onClick={props.onSendToBack}
                >
                  <SendToBack size={18} />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Send to back</TooltipContent>
            </Tooltip>
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
        </>
      )}

      {!editable && (
        <Badge variant="neutral" className="gap-1.5">
          <Eye size={14} aria-hidden />
          View only
        </Badge>
      )}

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
        <PresenceBar
          peers={props.peers}
          selfId={props.selfId}
          followId={props.followId}
          onFollow={props.onFollow}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" aria-label="Export">
              <Download size={18} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => props.onExport('png')}>
              Export PNG
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onExport('svg')}>
              Export SVG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {isOwner ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">
                {copied ? <Check size={18} /> : <Share2 size={18} />}
                {copied ? 'Copied' : 'Share'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void copyRoleLink('editor')}>
                Copy edit link
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyRoleLink('viewer')}>
                Copy view-only link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="secondary" onClick={copyCurrentLink}>
            {copied ? <Check size={18} /> : <Share2 size={18} />}
            {copied ? 'Copied' : 'Share'}
          </Button>
        )}
      </div>
    </div>
  );
}
