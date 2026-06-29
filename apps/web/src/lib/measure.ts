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
 * text. Here we measure the real width by laying the text out in a hidden DOM
 * span with the *same* CSS font — so the result matches exactly how the SVG
 * <text> renders, including system fonts like `system-ui` (SF Pro on macOS)
 * that canvas `measureText` resolves differently. Non-text shapes defer to the
 * shared geometry; falls back to the estimate when there's no DOM.
 */

let span: HTMLSpanElement | null | undefined;
function measureSpan(): HTMLSpanElement | null {
  if (span === undefined) {
    if (typeof document === 'undefined') {
      span = null;
    } else {
      span = document.createElement('span');
      Object.assign(span.style, {
        position: 'absolute',
        left: '-99999px',
        top: '0',
        visibility: 'hidden',
        whiteSpace: 'pre',
        pointerEvents: 'none',
      });
      document.body.appendChild(span);
    }
  }
  return span;
}

// Cache measured line widths; keyed by the font properties + the line text.
const cache = new Map<string, number>();

export function boundsOf(shape: Shape): Bounds {
  if (shape.type !== 'text') return shapeBounds(shape);
  const el = measureSpan();
  if (!el) return shapeBounds(shape);

  const family = FONT_STACKS[shape.fontFamily];
  const weight = shape.bold ? '700' : '400';
  const style = shape.italic ? 'italic' : 'normal';
  const lines = (shape.text || ' ').split('\n');

  let w = 8;
  for (const line of lines) {
    const text = line || ' ';
    const key = `${shape.fontFamily}|${shape.fontSize}|${weight}|${style}|${text}`;
    let lineW = cache.get(key);
    if (lineW === undefined) {
      el.style.fontFamily = family;
      el.style.fontSize = `${shape.fontSize}px`;
      el.style.fontWeight = weight;
      el.style.fontStyle = style;
      el.textContent = text;
      lineW = el.getBoundingClientRect().width;
      cache.set(key, lineW);
    }
    w = Math.max(w, lineW);
  }

  const lineHeight = shape.fontSize * TEXT_LINE_HEIGHT;
  return { x: shape.x, y: shape.y, w, h: Math.max(lineHeight, lines.length * lineHeight) };
}
