/**
 * The whiteboard document model, shared by the web client (which reads/writes
 * it through a Yjs `Y.Map`) and the server (which decodes a room's live doc for
 * its snapshot endpoint). These are plain serializable shapes — last-writer-
 * wins per shape id, which is all a whiteboard needs for conflict-free merge.
 */

export type ShapeType = 'rect' | 'ellipse' | 'note' | 'path' | 'text';

/** Font families offered by the text tool. */
export type FontFamily = 'sans' | 'serif' | 'mono';

export interface BaseShape {
  id: string;
  type: ShapeType;
  /** Top-left of the shape's bounding box, in board coordinates. */
  x: number;
  y: number;
  /** Hex color of the stroke/fill accent. */
  color: string;
  /** Awareness client id of the author, for attribution. */
  author: number;
  /** Stacking order; higher draws on top. Optional for back-compat (treated as 0). */
  z?: number;
}

export interface RectShape extends BaseShape {
  type: 'rect';
  w: number;
  h: number;
}

export interface EllipseShape extends BaseShape {
  type: 'ellipse';
  w: number;
  h: number;
}

export interface NoteShape extends BaseShape {
  type: 'note';
  w: number;
  h: number;
  text: string;
}

export interface PathShape extends BaseShape {
  type: 'path';
  /** Flat list of absolute board coords: [x0, y0, x1, y1, …]. */
  points: number[];
}

/** Free typography placed directly on the canvas (no box, transparent). */
export interface TextShape extends BaseShape {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: FontFamily;
  bold: boolean;
  italic: boolean;
}

export type Shape = RectShape | EllipseShape | NoteShape | PathShape | TextShape;

export type Bounds = { x: number; y: number; w: number; h: number };

/** Ephemeral presence state broadcast over Yjs awareness (never persisted). */
export interface Presence {
  user: { name: string; color: string };
  cursor: { x: number; y: number } | null;
  /** Ids of shapes this peer currently has selected. */
  selection?: string[];
  /** This peer's pan/zoom, used for follow-mode. */
  viewport?: { x: number; y: number; scale: number };
}

/**
 * A comment pinned to the board. Root comments (no parentId) place a pin at
 * (x, y); replies reference their root via parentId and form a thread.
 */
export interface Comment {
  id: string;
  x: number;
  y: number;
  author: number;
  authorName: string;
  text: string;
  createdAt: number;
  resolved: boolean;
  /** Root comment id when this is a reply; absent for a thread root. */
  parentId?: string;
}

/** Access level a room token grants. Owners can mint links; viewers are read-only. */
export type Role = 'owner' | 'editor' | 'viewer';

/** Whether a role may modify the board. */
export function canEdit(role: Role): boolean {
  return role !== 'viewer';
}

/** Fixed palette assigned to participants and used for new shapes. */
export const PALETTE = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#ef4444', // red
  '#8b5cf6', // violet
  '#14b8a6', // teal
] as const;
