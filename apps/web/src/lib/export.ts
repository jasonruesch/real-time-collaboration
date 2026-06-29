import { type Bounds, type Shape, pointsToPath, shapeBounds } from '@coalesce/board';

/**
 * Export shapes to a self-contained SVG (and PNG via canvas). Notes are
 * rendered as rect + <text> rather than foreignObject so the markup is pure SVG
 * and rasterizes cleanly onto a canvas without tainting it.
 */

const MARGIN = 32;
const NOTE_CHARS_PER_LINE = 22;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Union bounding box of all shapes. */
function unionBounds(shapes: Shape[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    const b = shapeBounds(s);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Naive word-wrap for note text. */
function wrap(text: string): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > NOTE_CHARS_PER_LINE) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 6);
}

function shapeToSvg(shape: Shape): string {
  const c = escapeXml(shape.color);
  if (shape.type === 'rect') {
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="6" fill="${c}" fill-opacity="0.15" stroke="${c}" stroke-width="2"/>`;
  }
  if (shape.type === 'ellipse') {
    return `<ellipse cx="${shape.x + shape.w / 2}" cy="${shape.y + shape.h / 2}" rx="${shape.w / 2}" ry="${shape.h / 2}" fill="${c}" fill-opacity="0.15" stroke="${c}" stroke-width="2"/>`;
  }
  if (shape.type === 'path') {
    return `<path d="${pointsToPath(shape.points)}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  // note
  const lines = wrap(shape.text)
    .map(
      (ln, i) =>
        `<tspan x="${shape.x + 8}" y="${shape.y + 20 + i * 16}">${escapeXml(ln)}</tspan>`,
    )
    .join('');
  return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="6" fill="${c}"/><text font-family="sans-serif" font-size="13" fill="#000">${lines}</text>`;
}

/** Build a standalone SVG document string for the given shapes. */
export function buildSvg(shapes: Shape[]): { svg: string; width: number; height: number } {
  const b = shapes.length ? unionBounds(shapes) : { x: 0, y: 0, w: 1, h: 1 };
  const x = b.x - MARGIN;
  const y = b.y - MARGIN;
  const width = Math.max(1, b.w + MARGIN * 2);
  const height = Math.max(1, b.h + MARGIN * 2);
  const body = shapes.map(shapeToSvg).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff"/>` +
    body +
    `</svg>`;
  return { svg, width, height };
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadSvg(shapes: Shape[], name = 'board'): void {
  const { svg } = buildSvg(shapes);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  triggerDownload(url, `${name}.svg`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPng(shapes: Shape[], name = 'board', scale = 2): Promise<void> {
  const { svg, width, height } = buildSvg(shapes);
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('failed to render svg'));
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${name}.png`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
