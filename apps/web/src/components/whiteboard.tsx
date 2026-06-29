import {
  type Shape,
  canEdit,
  moveShape,
  normalizeRect,
  pointsToPath,
  shapeBounds,
} from '@coalesce/board';
import { Spinner } from '@jasonruesch/react';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { CursorsLayer } from '~/components/cursors-layer';
import { Toolbar, type Tool } from '~/components/toolbar';
import { roleFromToken, userSeed } from '~/lib/auth';
import { makeUser } from '~/lib/use-local-user';
import { usePresence } from '~/lib/use-presence';
import { useRoom } from '~/lib/use-room';
import { useShapes } from '~/lib/use-shapes';

const NOTE_W = 168;
const NOTE_H = 128;
const MIN_DRAG = 4;

/** An in-progress pointer gesture, kept in a ref so it never goes stale. */
type Gesture =
  | { kind: 'create'; id: string; startX: number; startY: number }
  | { kind: 'pen'; id: string; points: number[] }
  | { kind: 'move'; id: string; startX: number; startY: number; orig: Shape };

export function Whiteboard({ roomId, token }: { roomId: string; token?: string | null }) {
  const role = roleFromToken(token ?? null);
  const editable = canEdit(role);
  const { room, status } = useRoom(roomId, token);
  const shapeList = useShapes(room?.shapes);
  const peers = usePresence(room?.awareness);

  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState<string>('#6366f1');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

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
    room.awareness.setLocalStateField('user', makeUser(userSeed()));
  }, [room]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const toBoard = useCallback((e: ReactPointerEvent): { x: number; y: number } => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const deleteSelected = useCallback(() => {
    if (room && selectedId && editable) {
      room.shapes.delete(selectedId);
      setSelectedId(null);
    }
  }, [room, selectedId, editable]);

  // Delete/Backspace removes the selection (unless typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      deleteSelected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected]);

  function onPointerDown(e: ReactPointerEvent) {
    if (!room || e.button !== 0) return;
    const { x, y } = toBoard(e);
    (e.target as Element).setPointerCapture(e.pointerId);

    if (tool === 'select') {
      // Topmost shape under the pointer wins.
      const hit = [...shapeList].reverse().find((s) => {
        const b = shapeBounds(s);
        return x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6;
      });
      if (hit) {
        setSelectedId(hit.id);
        // Viewers may select (to inspect) but not move.
        if (editable) {
          gestureRef.current = { kind: 'move', id: hit.id, startX: x, startY: y, orig: hit };
        }
      } else {
        setSelectedId(null);
      }
      return;
    }

    // Drawing tools require edit access.
    if (!editable) return;

    const id = crypto.randomUUID();
    const base = { id, color, author: selfId, x, y };

    if (tool === 'note') {
      const text = window.prompt('Note text', '') ?? '';
      room.shapes.set(id, { ...base, type: 'note', w: NOTE_W, h: NOTE_H, text });
      setSelectedId(id);
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
    const { x, y } = toBoard(e);
    room.awareness.setLocalStateField('cursor', { x, y });

    const g = gestureRef.current;
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
    } else {
      const next = moveShape(g.orig, x - g.startX, y - g.startY);
      scheduleWrite(() => room.shapes.set(g.id, next));
    }
  }

  function endGesture() {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g || !room) return;
    flushWrite();
    // Discard an accidental click (zero-size rect/ellipse).
    if (g.kind === 'create') {
      const shape = room.shapes.get(g.id);
      if (shape && 'w' in shape && shape.w < MIN_DRAG && shape.h < MIN_DRAG) {
        room.shapes.delete(g.id);
      } else {
        setSelectedId(g.id);
      }
    }
  }

  function editNote(shape: Shape) {
    if (shape.type !== 'note' || !room || !editable) return;
    const text = window.prompt('Note text', shape.text);
    if (text != null) room.shapes.set(shape.id, { ...shape, text });
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
        hasSelection={selectedId != null}
        onDeleteSelected={deleteSelected}
        onClear={() => editable && room.shapes.clear()}
        status={status}
        peers={peers}
        selfId={selfId}
        role={role}
        roomId={roomId}
      />
      <div
        ref={surfaceRef}
        className="board-surface relative min-h-0 flex-1 overflow-hidden bg-canvas"
      >
        <svg
          className="absolute inset-0 size-full"
          style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onPointerLeave={() => room.awareness.setLocalStateField('cursor', null)}
        >
          {shapeList.map((shape) => (
            <ShapeView
              key={shape.id}
              shape={shape}
              selected={shape.id === selectedId}
              onEditNote={editNote}
            />
          ))}
        </svg>
        <CursorsLayer peers={peers.filter((p) => p.clientId !== selfId)} />
      </div>
    </div>
  );
}

function ShapeView({
  shape,
  selected,
  onEditNote,
}: {
  shape: Shape;
  selected: boolean;
  onEditNote: (shape: Shape) => void;
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
      {shape.type === 'note' && (
        <foreignObject x={shape.x} y={shape.y} width={shape.w} height={shape.h}>
          <div
            onDoubleClick={() => onEditNote(shape)}
            className="size-full overflow-hidden rounded-md p-2 text-sm text-black shadow-md"
            style={{ backgroundColor: shape.color }}
            title="Double-click to edit"
          >
            {shape.text || 'Double-click to edit'}
          </div>
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
          pointerEvents="none"
        />
      )}
    </g>
  );
}
