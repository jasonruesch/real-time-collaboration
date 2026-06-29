/**
 * The whiteboard document model, shared by the web client (which reads/writes
 * it through a Yjs `Y.Map`) and the server (which decodes a room's live doc for
 * its snapshot endpoint). These are plain serializable shapes — last-writer-
 * wins per shape id, which is all a whiteboard needs for conflict-free merge.
 */

export type ShapeType = 'rect' | 'ellipse' | 'note' | 'path';

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

export type Shape = RectShape | EllipseShape | NoteShape | PathShape;

export type Bounds = { x: number; y: number; w: number; h: number };

/** Ephemeral presence state broadcast over Yjs awareness (never persisted). */
export interface Presence {
  user: { name: string; color: string };
  cursor: { x: number; y: number } | null;
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
