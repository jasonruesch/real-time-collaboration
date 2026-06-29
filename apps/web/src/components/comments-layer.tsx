import type { Comment } from '@coalesce/board';
import { Button } from '@jasonruesch/react';
import { Check, MessageCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface CommentsLayerProps {
  comments: Comment[];
  viewport: Viewport;
  editable: boolean;
  selfId: number;
  openId: string | null;
  onOpen: (id: string | null) => void;
  onSetText: (id: string, text: string) => void;
  onReply: (parentId: string, text: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
}

/** Pinned comments + the open thread, projected through the board viewport. */
export function CommentsLayer(props: CommentsLayerProps) {
  const { comments, viewport, openId } = props;
  const roots = comments.filter((c) => !c.parentId);
  const project = (x: number, y: number) => ({
    left: x * viewport.scale + viewport.x,
    top: y * viewport.scale + viewport.y,
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {roots.map((root) => {
        // Hide resolved pins unless their thread is open.
        if (root.resolved && root.id !== openId) return null;
        const pos = project(root.x, root.y);
        const replies = comments
          .filter((c) => c.parentId === root.id)
          .sort((a, b) => a.createdAt - b.createdAt);
        const count = (root.text ? 1 : 0) + replies.length;
        return (
          <div key={root.id} className="absolute" style={pos}>
            <button
              type="button"
              aria-label="Open comment thread"
              onClick={() => props.onOpen(openId === root.id ? null : root.id)}
              className="pointer-events-auto flex size-7 -translate-y-7 items-center justify-center rounded-full rounded-bl-none text-white shadow-md"
              style={{ backgroundColor: root.resolved ? '#94a3b8' : '#6366f1' }}
            >
              {count > 1 ? (
                <span className="text-xs font-semibold">{count}</span>
              ) : (
                <MessageCircle size={15} />
              )}
            </button>
            {openId === root.id && (
              <Thread root={root} replies={replies} {...props} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Thread({
  root,
  replies,
  editable,
  onSetText,
  onReply,
  onResolve,
  onDelete,
  onOpen,
}: CommentsLayerProps & { root: Comment; replies: Comment[] }) {
  const [draft, setDraft] = useState('');
  const messages = root.text ? [root, ...replies] : replies;

  function submit() {
    const text = draft.trim();
    if (!text) return;
    if (!root.text) onSetText(root.id, text);
    else onReply(root.id, text);
    setDraft('');
  }

  return (
    <div className="pointer-events-auto absolute left-2 top-0 w-64 rounded-lg border border-line bg-canvas p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">
          {root.resolved ? 'Resolved' : 'Comment'}
        </span>
        <div className="flex items-center gap-1">
          {editable && root.text && (
            <button
              type="button"
              aria-label={root.resolved ? 'Reopen' : 'Resolve'}
              title={root.resolved ? 'Reopen' : 'Resolve'}
              onClick={() => onResolve(root.id, !root.resolved)}
              className="rounded p-1 text-muted hover:text-fg"
            >
              <Check size={15} />
            </button>
          )}
          {editable && (
            <button
              type="button"
              aria-label="Delete thread"
              onClick={() => {
                onDelete(root.id);
                onOpen(null);
              }}
              className="rounded p-1 text-muted hover:text-fg"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-48 space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-xs text-muted">Add the first comment…</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="font-medium">{m.authorName}</span>
            <p className="whitespace-pre-wrap break-words text-fg">{m.text}</p>
          </div>
        ))}
      </div>

      {editable && !root.resolved && (
        <div className="mt-2 flex gap-1">
          <textarea
            autoFocus
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={root.text ? 'Reply…' : 'Comment…'}
            className="min-h-8 flex-1 resize-none rounded-md border border-line bg-canvas p-1.5 text-sm outline-none"
          />
          <Button variant="primary" onClick={submit} disabled={!draft.trim()}>
            Send
          </Button>
        </div>
      )}
    </div>
  );
}
