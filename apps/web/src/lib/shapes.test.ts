import {
  type PathShape,
  type RectShape,
  boundsOfPoints,
  colorFor,
  hitTest,
  moveShape,
  normalizeRect,
  pointsToPath,
  shapeBounds,
} from '@coalesce/board';
import { describe, expect, it } from 'vitest';

const rect: RectShape = {
  id: 'r',
  type: 'rect',
  x: 10,
  y: 20,
  w: 30,
  h: 40,
  color: '#000',
  author: 1,
};

const path: PathShape = {
  id: 'p',
  type: 'path',
  x: 0,
  y: 0,
  color: '#000',
  author: 1,
  points: [0, 0, 10, 5, 4, 20],
};

describe('normalizeRect', () => {
  it('produces a positive-size box regardless of drag direction', () => {
    expect(normalizeRect(40, 60, 10, 20)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
    expect(normalizeRect(10, 20, 40, 60)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });
});

describe('boundsOfPoints', () => {
  it('spans the min/max of the point list', () => {
    expect(boundsOfPoints(path.points)).toEqual({ x: 0, y: 0, w: 10, h: 20 });
  });
  it('is empty for a degenerate list', () => {
    expect(boundsOfPoints([5])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe('shapeBounds', () => {
  it('uses x/y/w/h for box shapes', () => {
    expect(shapeBounds(rect)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });
  it('computes the bbox for paths', () => {
    expect(shapeBounds(path)).toEqual({ x: 0, y: 0, w: 10, h: 20 });
  });
});

describe('hitTest', () => {
  it('hits inside the box and just outside within slop', () => {
    expect(hitTest(rect, 25, 40)).toBe(true);
    expect(hitTest(rect, 8, 18)).toBe(true); // within default slop
  });
  it('misses well outside the box', () => {
    expect(hitTest(rect, 200, 200)).toBe(false);
  });
});

describe('pointsToPath', () => {
  it('builds an SVG move/line command string', () => {
    expect(pointsToPath([0, 0, 10, 5])).toBe('M 0 0 L 10 5');
    expect(pointsToPath([1])).toBe('');
  });
});

describe('moveShape', () => {
  it('translates a box shape without mutating the original', () => {
    const moved = moveShape(rect, 5, 7);
    expect(moved).toMatchObject({ x: 15, y: 27 });
    expect(rect.x).toBe(10);
  });
  it('translates every point of a path', () => {
    const moved = moveShape(path, 2, 3) as PathShape;
    expect(moved.points).toEqual([2, 3, 12, 8, 6, 23]);
  });
});

describe('colorFor', () => {
  it('is deterministic for a given client id', () => {
    expect(colorFor(5)).toBe(colorFor(5));
  });
});
