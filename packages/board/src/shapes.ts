import { PALETTE } from './types.ts';
import type { Bounds, Shape } from './types.ts';

/**
 * Normalize a drag (start → current) into a positive-size rectangle, so dragging
 * up/left produces the same valid box as dragging down/right.
 */
export function normalizeRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Bounds {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

/** Axis-aligned bounding box of any shape. */
export function shapeBounds(shape: Shape): Bounds {
  if (shape.type === 'path') return boundsOfPoints(shape.points);
  return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
}

/** Bounding box of a flat [x0,y0,x1,y1,…] point list. */
export function boundsOfPoints(points: number[]): Bounds {
  if (points.length < 2) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const px = points[i];
    const py = points[i + 1];
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Hit-test a point against a shape's bounding box, with a few px of slop so thin
 * shapes and freehand strokes are still easy to grab.
 */
export function hitTest(shape: Shape, px: number, py: number, slop = 6): boolean {
  const b = shapeBounds(shape);
  return (
    px >= b.x - slop &&
    px <= b.x + b.w + slop &&
    py >= b.y - slop &&
    py <= b.y + b.h + slop
  );
}

/** Build an SVG `d` attribute from a flat point list. */
export function pointsToPath(points: number[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i + 1 < points.length; i += 2) {
    d += ` L ${points[i]} ${points[i + 1]}`;
  }
  return d;
}

/** Translate a shape by (dx, dy), returning a new shape (never mutates). */
export function moveShape(shape: Shape, dx: number, dy: number): Shape {
  if (shape.type === 'path') {
    const points = shape.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy));
    return { ...shape, points, x: shape.x + dx, y: shape.y + dy };
  }
  return { ...shape, x: shape.x + dx, y: shape.y + dy };
}

/** Deterministically pick a palette color from an awareness client id. */
export function colorFor(clientId: number): string {
  return PALETTE[Math.abs(clientId) % PALETTE.length];
}
