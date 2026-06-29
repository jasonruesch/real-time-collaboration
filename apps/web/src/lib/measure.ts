import {
  type Bounds,
  FONT_STACKS,
  type Shape,
  TEXT_LINE_HEIGHT,
  shapeBounds,
} from '@coalesce/board';

/**
 * Accurate client-side bounds. For text shapes the shared `shapeBounds` only
 * estimates width from an average glyph width, which over-pads proportional
 * text; here we measure the real rendered width with a canvas 2D context so the
 * selection box, hit area, and export frame hug the glyphs. Non-text shapes
 * defer to the shared geometry. Falls back to the estimate if no canvas exists.
 */

let ctx: CanvasRenderingContext2D | null | undefined;
function measureCtx(): CanvasRenderingContext2D | null {
  if (ctx === undefined) ctx = document.createElement('canvas').getContext('2d');
  return ctx;
}

export function boundsOf(shape: Shape): Bounds {
  if (shape.type !== 'text') return shapeBounds(shape);
  const c = measureCtx();
  if (!c) return shapeBounds(shape);
  c.font = `${shape.italic ? 'italic ' : ''}${shape.bold ? '700' : '400'} ${shape.fontSize}px ${FONT_STACKS[shape.fontFamily]}`;
  const lines = (shape.text || ' ').split('\n');
  const w = Math.max(8, ...lines.map((l) => c.measureText(l || ' ').width));
  const lineHeight = shape.fontSize * TEXT_LINE_HEIGHT;
  return { x: shape.x, y: shape.y, w, h: Math.max(lineHeight, lines.length * lineHeight) };
}
