import {
  type Bounds,
  FONT_STACKS,
  TEXT_LINE_HEIGHT,
  type Shape,
  type TextShape,
  backZ,
  canEdit,
  moveShape,
  nextZ,
  normalizeRect,
  pointsToPath,
  shapeBounds,
  sortByZ,
} from '@coalesce/board';
import { Spinner } from '@jasonruesch/react';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CommentsLayer } from '~/components/comments-layer';
import { CursorsLayer } from '~/components/cursors-layer';
import { Toolbar, type TextStyle, type Tool } from '~/components/toolbar';
import { roleFromToken, userSeed } from '~/lib/auth';
import { downloadPng, downloadSvg } from '~/lib/export';
import { useComments } from '~/lib/use-comments';
import { makeUser } from '~/lib/use-local-user';
import { usePresence } from '~/lib/use-presence';
import { useRoom } from '~/lib/use-room';
import { useShapes } from '~/lib/use-shapes';

const NOTE_W = 168;
const NOTE_H = 128;
const MIN_DRAG = 4;
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const PASTE_OFFSET = 20;

/** Pan + zoom of the board relative to the screen. */
interface Viewport {
  x: number;
  y: number;
  scale: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Whether two axis-aligned boxes overlap (used by marquee selection). */
function rectsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

/** An in-progress pointer gesture, kept in a ref so it never goes stale. */
type Gesture =
  | { kind: 'create'; id: string; startX: number; startY: number }
  | { kind: 'pen'; id: string; points: number[] }
  | { kind: 'move'; startX: number; startY: number; orig: Shape[] }
  | { kind: 'marquee'; startX: number; startY: number; curX: number; curY: number; additive: boolean }
  | { kind: 'pan'; startSX: number; startSY: number; origX: number; origY: number };

export function Whiteboard({ roomId, token }: { roomId: string; token?: string | null }) {
  const role = roleFromToken(token ?? null);
  const editable = canEdit(role);
  const { room, status } = useRoom(roomId, token);
  const shapeList = useShapes(room?.shapes);
  const commentList = useComments(room?.comments);
  const peers = usePresence(room?.awareness);
  const me = useMemo(() => makeUser(userSeed()), []);

  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState<string>('#6366f1');
  const [textStyle, setTextStyle] = useState<TextStyle>({
    fontSize: 24,
    fontFamily: 'sans',
    bold: false,
    italic: false,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openComment, setOpenComment] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [followId, setFollowId] = useState<number | null>(null);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });

  // Shapes painted bottom-to-top by stacking order.
  const ordered = sortByZ(shapeList);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  // A local clipboard of copied shapes (survives within the tab/session).
  const clipboardRef = useRef<Shape[]>([]);
  // Mirror viewport in a ref so gesture handlers read the latest without re-binding.
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // Coalesce rapid pointer writes to one per animation frame.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const scheduleWrite = useCallback((fn: () => void) => {
    pendingRef.current = fn;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const run = pendingRef.current;
        pendingRef.current = null;
        run?.();
      });
    }
  }, []);
  const flushWrite = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const run = pendingRef.current;
    pendingRef.current = null;
    run?.();
  }, []);

  // Announce identity to peers once connected. The display name/color come from
  // a persisted per-browser seed so they stay stable across reloads.
  const selfId = room?.awareness.clientID ?? 0;
  useEffect(() => {
    if (!room) return;
    room.awareness.setLocalStateField('user', me);
  }, [room, me]);

  // Broadcast selection so peers can see what each other has selected.
  useEffect(() => {
    room?.awareness.setLocalStateField('selection', [...selectedIds]);
  }, [room, selectedIds]);

  // Reflect a selected text shape's typography in the toolbar controls.
  const selectedText = shapeList.find(
    (s): s is TextShape => selectedIds.has(s.id) && s.type === 'text',
  );
  useEffect(() => {
    if (selectedText) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTextStyle({
        fontSize: selectedText.fontSize,
        fontFamily: selectedText.fontFamily,
        bold: selectedText.bold,
        italic: selectedText.italic,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedText?.id,
    selectedText?.fontSize,
    selectedText?.fontFamily,
    selectedText?.bold,
    selectedText?.italic,
  ]);

  // Broadcast viewport so peers can follow this user's view.
  useEffect(() => {
    room?.awareness.setLocalStateField('viewport', viewport);
  }, [room, viewport]);

  // Follow-mode: mirror a peer's viewport as it moves (sync external → React).
  const followView = followId != null
    ? peers.find((p) => p.clientId === followId)?.viewport
    : undefined;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (followView) setViewport(followView);
    // Depend on the primitive fields, not the followView object — it's a fresh
    // reference each render and would otherwise loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followView?.x, followView?.y, followView?.scale]);
  // Stop following if that peer leaves.
  useEffect(() => {
    if (followId != null && !peers.some((p) => p.clientId === followId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFollowId(null);
    }
  }, [peers, followId]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  // Track undo/redo availability for the toolbar buttons.
  useEffect(() => {
    if (!room) return;
    const um = room.undoManager;
    const update = () => setUndoState({ canUndo: um.canUndo(), canRedo: um.canRedo() });
    update();
    um.on('stack-item-added', update);
    um.on('stack-item-popped', update);
    um.on('stack-cleared', update);
    return () => {
      um.off('stack-item-added', update);
      um.off('stack-item-popped', update);
      um.off('stack-cleared', update);
    };
  }, [room]);

  // Screen → board coordinates, inverting the current pan/zoom. Every gesture
  // funnels through here, so this is the one place the transform is undone.
  const toBoard = useCallback((e: ReactPointerEvent): { x: number; y: number } => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    const v = viewportRef.current;
    return {
      x: (e.clientX - rect.left - v.x) / v.scale,
      y: (e.clientY - rect.top - v.y) / v.scale,
    };
  }, []);

  // Wheel = pan; ⌘/ctrl+wheel (and trackpad pinch) = zoom toward the cursor.
  // Bound natively as non-passive so preventDefault stops the page from scrolling.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setFollowId(null); // taking manual control exits follow-mode
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setViewport((v) => {
        if (e.ctrlKey || e.metaKey) {
          const scale = clamp(v.scale * Math.exp(-e.deltaY * 0.01), MIN_SCALE, MAX_SCALE);
          const bx = (sx - v.x) / v.scale;
          const by = (sy - v.y) / v.scale;
          return { scale, x: sx - bx * scale, y: sy - by * scale };
        }
        return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // Re-run once the board surface exists (it's absent on the initial
    // pre-connection render, when room is still null).
  }, [room]);

  // Hold space to pan with the left button (also available via middle-drag).
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    const down = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isField(e.target)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ---- Mutations (all gated on edit access; all undoable as one step) --------

  const deleteSelected = useCallback(() => {
    if (!room || !editable || selectedIds.size === 0) return;
    room.doc.transact(() => selectedIds.forEach((id) => room.shapes.delete(id)));
    setSelectedIds(new Set());
  }, [room, editable, selectedIds]);

  const undo = useCallback(() => room?.undoManager.undo(), [room]);
  const redo = useCallback(() => room?.undoManager.redo(), [room]);

  // Stamp copies with fresh ids, a small offset, this author, and new top z.
  const placeCopies = useCallback(
    (src: Shape[]) => {
      if (!room || !editable || src.length === 0) return;
      const baseZ = nextZ(shapeList);
      const ids: string[] = [];
      room.doc.transact(() => {
        sortByZ(src).forEach((s, i) => {
          const id = crypto.randomUUID();
          ids.push(id);
          room.shapes.set(id, {
            ...moveShape(s, PASTE_OFFSET, PASTE_OFFSET),
            id,
            author: selfId,
            z: baseZ + i,
          });
        });
      });
      setSelectedIds(new Set(ids));
    },
    [room, editable, shapeList, selfId],
  );

  const selectedShapes = useCallback(
    () => ordered.filter((s) => selectedIds.has(s.id)),
    [ordered, selectedIds],
  );

  const copy = useCallback(() => {
    const sel = selectedShapes();
    if (sel.length === 0) return;
    clipboardRef.current = sel.map((s) => structuredClone(s));
    void navigator.clipboard?.writeText(JSON.stringify(clipboardRef.current)).catch(() => {});
  }, [selectedShapes]);

  const paste = useCallback(() => placeCopies(clipboardRef.current), [placeCopies]);
  const duplicate = useCallback(() => placeCopies(selectedShapes()), [placeCopies, selectedShapes]);

  const bringToFront = useCallback(() => {
    if (!room || !editable) return;
    let z = nextZ(shapeList);
    room.doc.transact(() =>
      selectedShapes().forEach((s) => room.shapes.set(s.id, { ...s, z: z++ })),
    );
  }, [room, editable, shapeList, selectedShapes]);

  // Update the active typography (used for new text) and apply it to any
  // selected text shapes.
  const changeTextStyle = useCallback(
    (patch: Partial<TextStyle>) => {
      setTextStyle((prev) => ({ ...prev, ...patch }));
      if (!room || !editable) return;
      const texts = shapeList.filter(
        (s): s is TextShape => selectedIds.has(s.id) && s.type === 'text',
      );
      if (texts.length) {
        room.doc.transact(() =>
          texts.forEach((t) => room.shapes.set(t.id, { ...t, ...patch })),
        );
      }
    },
    [room, editable, shapeList, selectedIds],
  );

  // Export the current selection if any, otherwise the whole board.
  const exportBoard = useCallback(
    (format: 'png' | 'svg') => {
      const sel = selectedShapes();
      const subject = sel.length ? sel : shapeList;
      if (subject.length === 0) return;
      if (format === 'png') void downloadPng(subject, roomId);
      else downloadSvg(subject, roomId);
    },
    [selectedShapes, shapeList, roomId],
  );

  const sendToBack = useCallback(() => {
    if (!room || !editable) return;
    let z = backZ(shapeList);
    // Iterate top-to-bottom so relative order is preserved beneath everything.
    [...selectedShapes()].reverse().forEach((s) => {
      room.doc.transact(() => room.shapes.set(s.id, { ...s, z: z-- }));
    });
  }, [room, editable, shapeList, selectedShapes]);

  // ---- Comments --------------------------------------------------------------

  const commentSetText = useCallback(
    (id: string, text: string) => {
      const c = room?.comments.get(id);
      if (c) room!.comments.set(id, { ...c, text });
    },
    [room],
  );

  const commentReply = useCallback(
    (parentId: string, text: string) => {
      if (!room) return;
      const parent = room.comments.get(parentId);
      if (!parent) return;
      const id = crypto.randomUUID();
      room.comments.set(id, {
        id,
        x: parent.x,
        y: parent.y,
        author: selfId,
        authorName: me.name,
        text,
        createdAt: Date.now(),
        resolved: false,
        parentId,
      });
    },
    [room, selfId, me.name],
  );

  const commentResolve = useCallback(
    (id: string, resolved: boolean) => {
      const c = room?.comments.get(id);
      if (c) room!.comments.set(id, { ...c, resolved });
    },
    [room],
  );

  const commentDelete = useCallback(
    (id: string) => {
      if (!room) return;
      // Deleting a root removes its whole thread.
      const replies = commentList.filter((c) => c.parentId === id).map((c) => c.id);
      room.doc.transact(() => {
        room.comments.delete(id);
        replies.forEach((rid) => room.comments.delete(rid));
      });
    },
    [room, commentList],
  );

  // Opening another thread (or closing) discards a pin that was placed but left
  // empty, so an accidental click doesn't litter the board.
  const handleOpenComment = useCallback(
    (id: string | null) => {
      setOpenComment((prev) => {
        if (prev && prev !== id) {
          const root = room?.comments.get(prev);
          const hasReplies = commentList.some((c) => c.parentId === prev);
          if (root && !root.text && !hasReplies) room?.comments.delete(prev);
        }
        return id;
      });
    },
    [room, commentList],
  );

  // Keyboard shortcuts: delete, undo/redo, copy/paste/duplicate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteSelected();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 'c') {
        copy();
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        paste();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, undo, redo, copy, paste, duplicate]);

  // ---- Pointer handling -----------------------------------------------------

  function onPointerDown(e: ReactPointerEvent) {
    if (!room) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setEditingId(null);

    // Pan: middle button, or left button while space is held.
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      setFollowId(null); // taking manual control exits follow-mode
      const v = viewportRef.current;
      gestureRef.current = {
        kind: 'pan',
        startSX: e.clientX,
        startSY: e.clientY,
        origX: v.x,
        origY: v.y,
      };
      return;
    }
    if (e.button !== 0) return;
    const { x, y } = toBoard(e);

    if (tool === 'select') {
      // Topmost shape under the pointer wins (highest stacking order).
      const hit = [...ordered].reverse().find((s) => {
        const b = shapeBounds(s);
        return x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6;
      });
      if (hit) {
        if (e.shiftKey) {
          // Toggle membership; don't start a move.
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(hit.id)) next.delete(hit.id);
            else next.add(hit.id);
            return next;
          });
          return;
        }
        const ids = selectedIds.has(hit.id) ? [...selectedIds] : [hit.id];
        if (!selectedIds.has(hit.id)) setSelectedIds(new Set([hit.id]));
        if (editable) {
          const orig = ids
            .map((id) => room.shapes.get(id))
            .filter((s): s is Shape => s != null);
          gestureRef.current = { kind: 'move', startX: x, startY: y, orig };
        }
      } else {
        if (!e.shiftKey) setSelectedIds(new Set());
        gestureRef.current = {
          kind: 'marquee',
          startX: x,
          startY: y,
          curX: x,
          curY: y,
          additive: e.shiftKey,
        };
        setMarquee({ x, y, w: 0, h: 0 });
      }
      return;
    }

    // Drawing tools require edit access.
    if (!editable) return;

    if (tool === 'comment') {
      const id = crypto.randomUUID();
      room.comments.set(id, {
        id,
        x,
        y,
        author: selfId,
        authorName: me.name,
        text: '',
        createdAt: Date.now(),
        resolved: false,
      });
      setOpenComment(id);
      setTool('select');
      return;
    }

    const id = crypto.randomUUID();
    const base = { id, color, author: selfId, x, y, z: nextZ(shapeList) };

    if (tool === 'note') {
      room.shapes.set(id, { ...base, type: 'note', w: NOTE_W, h: NOTE_H, text: '' });
      setSelectedIds(new Set([id]));
      setEditingId(id); // open the inline editor immediately
      setTool('select');
      return;
    }
    if (tool === 'text') {
      room.shapes.set(id, {
        ...base,
        type: 'text',
        text: '',
        fontSize: textStyle.fontSize,
        fontFamily: textStyle.fontFamily,
        bold: textStyle.bold,
        italic: textStyle.italic,
      });
      setSelectedIds(new Set([id]));
      setEditingId(id);
      setTool('select');
      return;
    }
    if (tool === 'pen') {
      gestureRef.current = { kind: 'pen', id, points: [x, y] };
      room.shapes.set(id, { ...base, type: 'path', points: [x, y] });
      return;
    }
    // rect / ellipse: start a zero-size shape and resize on drag.
    room.shapes.set(id, { ...base, type: tool, w: 0, h: 0 });
    gestureRef.current = { kind: 'create', id, startX: x, startY: y };
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!room) return;

    const g = gestureRef.current;
    if (g?.kind === 'pan') {
      // Pan tracks raw screen movement, independent of zoom.
      setViewport((v) => ({
        ...v,
        x: g.origX + (e.clientX - g.startSX),
        y: g.origY + (e.clientY - g.startSY),
      }));
      return;
    }

    const { x, y } = toBoard(e);
    room.awareness.setLocalStateField('cursor', { x, y });

    if (!g) return;

    if (g.kind === 'create') {
      const r = normalizeRect(g.startX, g.startY, x, y);
      const prev = room.shapes.get(g.id);
      if (prev && (prev.type === 'rect' || prev.type === 'ellipse')) {
        scheduleWrite(() => room.shapes.set(g.id, { ...prev, ...r }));
      }
    } else if (g.kind === 'pen') {
      g.points.push(x, y);
      const points = g.points.slice();
      const prev = room.shapes.get(g.id);
      if (prev && prev.type === 'path') {
        scheduleWrite(() => room.shapes.set(g.id, { ...prev, points }));
      }
    } else if (g.kind === 'marquee') {
      g.curX = x;
      g.curY = y;
      setMarquee(normalizeRect(g.startX, g.startY, x, y));
    } else {
      // Move every selected shape by the same delta, as one undoable step.
      const dx = x - g.startX;
      const dy = y - g.startY;
      scheduleWrite(() =>
        room.doc.transact(() =>
          g.orig.forEach((s) => room.shapes.set(s.id, moveShape(s, dx, dy))),
        ),
      );
    }
  }

  function endGesture() {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g || !room) return;
    flushWrite();

    if (g.kind === 'create') {
      // Discard an accidental click (zero-size rect/ellipse).
      const shape = room.shapes.get(g.id);
      if (shape && 'w' in shape && shape.w < MIN_DRAG && shape.h < MIN_DRAG) {
        room.shapes.delete(g.id);
      } else {
        setSelectedIds(new Set([g.id]));
      }
    } else if (g.kind === 'marquee') {
      const box = normalizeRect(g.startX, g.startY, g.curX, g.curY);
      const hitIds = ordered
        .filter((s) => rectsIntersect(shapeBounds(s), box))
        .map((s) => s.id);
      setSelectedIds((prev) =>
        g.additive ? new Set([...prev, ...hitIds]) : new Set(hitIds),
      );
      setMarquee(null);
    }
  }

  function commitText(id: string, text: string) {
    if (!room || !editable) {
      setEditingId(null);
      return;
    }
    const shape = room.shapes.get(id);
    if (shape?.type === 'note') {
      room.shapes.set(id, { ...shape, text });
    } else if (shape?.type === 'text') {
      // An emptied text element is discarded rather than left invisible.
      if (text.trim() === '') room.shapes.delete(id);
      else room.shapes.set(id, { ...shape, text });
    }
    setEditingId(null);
  }

  if (!room) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Joining board…" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        tool={tool}
        onToolChange={setTool}
        color={color}
        onColorChange={setColor}
        hasSelection={selectedIds.size > 0}
        onDeleteSelected={deleteSelected}
        onClear={() => editable && room.shapes.clear()}
        onUndo={undo}
        onRedo={redo}
        canUndo={undoState.canUndo}
        canRedo={undoState.canRedo}
        onBringToFront={bringToFront}
        onSendToBack={sendToBack}
        onExport={exportBoard}
        showTextControls={editable && (tool === 'text' || selectedText != null)}
        textStyle={textStyle}
        onTextStyleChange={changeTextStyle}
        status={status}
        peers={peers}
        selfId={selfId}
        followId={followId}
        onFollow={(id) => setFollowId((prev) => (prev === id ? null : id))}
        role={role}
        roomId={roomId}
      />
      <div
        ref={surfaceRef}
        className="board-surface relative min-h-0 flex-1 overflow-hidden bg-canvas"
      >
        <svg
          className="absolute inset-0 size-full"
          style={{
            cursor: spaceHeld ? 'grab' : tool === 'select' ? 'default' : 'crosshair',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onPointerLeave={() => room.awareness.setLocalStateField('cursor', null)}
        >
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
            {ordered.map((shape) => (
              <ShapeView
                key={shape.id}
                shape={shape}
                selected={selectedIds.has(shape.id)}
                editing={editingId === shape.id}
                editable={editable}
                onStartEdit={() => editable && setEditingId(shape.id)}
                onCommitText={commitText}
              />
            ))}
            {marquee && (
              <rect
                x={marquee.x}
                y={marquee.y}
                width={marquee.w}
                height={marquee.h}
                fill="var(--color-accent, #6366f1)"
                fillOpacity={0.08}
                stroke="var(--color-accent, #6366f1)"
                strokeWidth={1}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {/* Remote peers' selections, outlined in each peer's color. */}
            {peers
              .filter((p) => p.clientId !== selfId && p.selection?.length)
              .flatMap((p) =>
                p.selection!.map((id) => {
                  const s = shapeList.find((sh) => sh.id === id);
                  if (!s) return null;
                  const bb = shapeBounds(s);
                  return (
                    <rect
                      key={`${p.clientId}-${id}`}
                      x={bb.x - 3}
                      y={bb.y - 3}
                      width={bb.w + 6}
                      height={bb.h + 6}
                      fill="none"
                      stroke={p.user?.color ?? '#888'}
                      strokeWidth={1.5}
                      opacity={0.8}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  );
                }),
              )}
          </g>
        </svg>
        <CursorsLayer
          peers={peers.filter((p) => p.clientId !== selfId)}
          viewport={viewport}
        />
        <CommentsLayer
          comments={commentList}
          viewport={viewport}
          editable={editable}
          selfId={selfId}
          openId={openComment}
          onOpen={handleOpenComment}
          onSetText={commentSetText}
          onReply={commentReply}
          onResolve={commentResolve}
          onDelete={commentDelete}
        />
        {followId != null && (
          <div className="pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1.5 text-sm shadow-lg">
            <span
              className="size-2 rounded-full"
              style={{
                backgroundColor:
                  peers.find((p) => p.clientId === followId)?.user?.color ?? '#888',
              }}
            />
            Following {peers.find((p) => p.clientId === followId)?.user?.name ?? 'peer'}
            <button
              type="button"
              onClick={() => setFollowId(null)}
              className="ml-1 font-medium text-accent hover:underline"
            >
              Stop
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ShapeView({
  shape,
  selected,
  editing,
  editable,
  onStartEdit,
  onCommitText,
}: {
  shape: Shape;
  selected: boolean;
  editing: boolean;
  editable: boolean;
  onStartEdit: () => void;
  onCommitText: (id: string, text: string) => void;
}) {
  const b = shapeBounds(shape);
  return (
    <g>
      {shape.type === 'rect' && (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          rx={6}
          fill={shape.color}
          fillOpacity={0.15}
          stroke={shape.color}
          strokeWidth={2}
        />
      )}
      {shape.type === 'ellipse' && (
        <ellipse
          cx={shape.x + shape.w / 2}
          cy={shape.y + shape.h / 2}
          rx={shape.w / 2}
          ry={shape.h / 2}
          fill={shape.color}
          fillOpacity={0.15}
          stroke={shape.color}
          strokeWidth={2}
        />
      )}
      {shape.type === 'path' && (
        <path
          d={pointsToPath(shape.points)}
          fill="none"
          stroke={shape.color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {shape.type === 'text' &&
        (editing ? (
          <foreignObject
            x={shape.x}
            y={shape.y}
            width={Math.max(b.w + 80, 160)}
            height={Math.max(b.h + 16, shape.fontSize * 2)}
          >
            <textarea
              autoFocus
              defaultValue={shape.text}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => onCommitText(shape.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
              }}
              className="size-full resize-none border-none bg-transparent p-0 outline-none"
              style={{
                color: shape.color,
                fontFamily: FONT_STACKS[shape.fontFamily],
                fontSize: shape.fontSize,
                fontWeight: shape.bold ? 700 : 400,
                fontStyle: shape.italic ? 'italic' : 'normal',
                lineHeight: TEXT_LINE_HEIGHT,
              }}
            />
          </foreignObject>
        ) : (
          <text
            x={shape.x}
            y={shape.y}
            fill={shape.color}
            fontFamily={FONT_STACKS[shape.fontFamily]}
            fontSize={shape.fontSize}
            fontWeight={shape.bold ? 700 : 400}
            fontStyle={shape.italic ? 'italic' : 'normal'}
            style={{ cursor: editable ? 'text' : 'default' }}
            onDoubleClick={onStartEdit}
          >
            {(shape.text || ' ').split('\n').map((line, i) => (
              <tspan
                key={`${shape.id}-${i}`}
                x={shape.x}
                dy={i === 0 ? shape.fontSize : shape.fontSize * TEXT_LINE_HEIGHT}
              >
                {line || ' '}
              </tspan>
            ))}
          </text>
        ))}
      {shape.type === 'note' && (
        <foreignObject x={shape.x} y={shape.y} width={shape.w} height={shape.h}>
          {editing ? (
            <textarea
              autoFocus
              defaultValue={shape.text}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => onCommitText(shape.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
              }}
              className="size-full resize-none rounded-md border-none p-2 text-sm text-black shadow-md outline-none"
              style={{ backgroundColor: shape.color }}
            />
          ) : (
            <div
              onDoubleClick={onStartEdit}
              className="size-full overflow-hidden rounded-md p-2 text-sm text-black shadow-md"
              style={{ backgroundColor: shape.color }}
              title={editable ? 'Double-click to edit' : undefined}
            >
              {shape.text || (editable ? 'Double-click to edit' : '')}
            </div>
          )}
        </foreignObject>
      )}
      {selected && (
        <rect
          x={b.x - 4}
          y={b.y - 4}
          width={b.w + 8}
          height={b.h + 8}
          fill="none"
          stroke="var(--color-accent, #6366f1)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
    </g>
  );
}
