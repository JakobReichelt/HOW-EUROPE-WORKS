/** Low-level p5 drawing helpers. Callers set fill/stroke; these only build shapes. */
import type p5 from 'p5';
import type { GuideStyle } from '../../config/encoding';
import { theme } from '../../config/theme';
import type { Rect } from '../geometry';

export function ctx2d(p: p5): CanvasRenderingContext2D {
  return p.drawingContext as CanvasRenderingContext2D;
}

/** Dash pattern in screen pixels; pass 1 / zoom when drawing in world space. */
export function setDash(p: p5, style: GuideStyle | 'none', scale = 1): void {
  const pattern = style === 'dashed' ? [6, 4] : style === 'dotted' ? [1.5, 3] : [];
  ctx2d(p).setLineDash(pattern.map((v) => v * scale));
}

export function annularSector(
  p: p5,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
): void {
  if (a1 <= a0) return;
  const ctx = ctx2d(p);
  const renderer = (p as unknown as { _renderer?: { _doFill?: boolean; _doStroke?: boolean } })
    ._renderer;
  const doFill = renderer?._doFill !== false;
  const doStroke = renderer?._doStroke !== false;
  ctx.beginPath();
  ctx.arc(cx, cy, r1, a0, a1);
  ctx.arc(cx, cy, r0, a1, a0, true);
  ctx.closePath();
  if (doFill) ctx.fill();
  if (doStroke) ctx.stroke();
}

export function ringOutline(p: p5, cx: number, cy: number, r: number): void {
  p.noFill();
  p.circle(cx, cy, r * 2);
}

export function radialLine(
  p: p5,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  angle: number,
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  p.line(cx + cos * r0, cy + sin * r0, cx + cos * r1, cy + sin * r1);
}

/** Short tangential tick on a circle at `angle` (Figma gender boundary mark). */
export function roundRectFill(p: p5, x: number, y: number, w: number, h: number, r: number): void {
  const ctx = ctx2d(p);
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    return;
  }
  p.rect(x, y, w, h, r);
}

/** Mars icon (Figma Group 11), stroke-only vector. */
export function drawMarsSymbol(p: p5, x: number, y: number, size: number, lineScale = 1): void {
  const r = size * 0.42;
  p.noFill();
  p.strokeCap(p.ROUND);
  p.strokeJoin(p.ROUND);
  p.strokeWeight(theme.detail.genderSymbolStroke * lineScale);
  p.circle(x, y, r * 2);
  const sx = x + r * 0.65;
  const sy = y - r * 0.65;
  const ex = x + r * 1.45;
  const ey = y - r * 1.45;
  p.line(sx, sy, ex, ey);
  const ah = r * 0.35;
  p.line(ex, ey, ex - ah, ey);
  p.line(ex, ey, ex, ey + ah);
}

/** Venus icon (Figma Group 12), stroke-only vector. */
export function drawVenusSymbol(p: p5, x: number, y: number, size: number, lineScale = 1): void {
  const r = size * 0.42;
  const cy = y - r * 0.15;
  p.noFill();
  p.strokeCap(p.ROUND);
  p.strokeJoin(p.ROUND);
  p.strokeWeight(theme.detail.genderSymbolStroke * lineScale);
  p.circle(x, cy, r * 2);
  const barY = cy + r + r * 0.35;
  p.line(x, cy + r, x, barY + r * 0.5);
  p.line(x - r * 0.55, barY, x + r * 0.55, barY);
}

export function tangentialTick(
  p: p5,
  cx: number,
  cy: number,
  r: number,
  angle: number,
  halfLen: number,
): void {
  const px = cx + Math.cos(angle) * r;
  const py = cy + Math.sin(angle) * r;
  const tx = -Math.sin(angle);
  const ty = Math.cos(angle);
  p.line(px - tx * halfLen, py - ty * halfLen, px + tx * halfLen, py + ty * halfLen);
}

/**
 * Cached repeating line pattern. One fill replaces a clip plus hundreds of strokes
 * (Firefox reapplies a non-rectangular clip on every stroke).
 */
const hatchTiles = new Map<string, CanvasPattern>();

function hatchPattern(
  ctx: CanvasRenderingContext2D,
  spacing: number,
  lineWidth: number,
  angle: number,
  color: string,
): CanvasPattern | null {
  const step = Math.max(1, spacing);
  const weight = Math.max(0.5, lineWidth);
  const key = `${step.toFixed(2)}|${weight.toFixed(2)}|${angle.toFixed(4)}|${color}`;
  const hit = hatchTiles.get(key);
  if (hit) return hit;

  const size = Math.ceil(step);
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const t = tile.getContext('2d');
  if (!t) return null;
  t.strokeStyle = color;
  t.lineWidth = weight;
  t.lineCap = 'butt';
  t.beginPath();
  // Horizontal stripe; the pattern matrix rotates it to `angle`.
  t.moveTo(0, size / 2);
  t.lineTo(size, size / 2);
  t.stroke();

  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return null;
  if (typeof pattern.setTransform === 'function') {
    const matrix = new DOMMatrix().rotate((angle * 180) / Math.PI);
    pattern.setTransform(matrix);
  }
  hatchTiles.set(key, pattern);
  return pattern;
}

/** Fill an annular sector with the hatch pattern. No clip. */
export function hatchAnnularSector(
  p: p5,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  a0: number,
  a1: number,
  spacing: number,
  lineWidth: number,
  angle: number,
  color: string,
): void {
  if (spacing <= 0 || a1 <= a0) return;
  const ctx = ctx2d(p);
  const pattern = hatchPattern(ctx, spacing, lineWidth, angle, color);
  if (!pattern) return;
  ctx.save();
  ctx.fillStyle = pattern;
  ctx.beginPath();
  ctx.arc(cx, cy, r1, a0, a1);
  ctx.arc(cx, cy, r0, a1, a0, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Fill a rectangle with the hatch pattern. No clip. */
export function hatchRect(
  p: p5,
  rect: Rect,
  spacing: number,
  lineWidth: number,
  angle: number,
  color: string,
): void {
  if (spacing <= 0 || rect.w <= 0 || rect.h <= 0) return;
  const ctx = ctx2d(p);
  const pattern = hatchPattern(ctx, spacing, lineWidth, angle, color);
  if (!pattern) return;
  ctx.save();
  ctx.fillStyle = pattern;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

export interface TextRun {
  text: string;
  bold?: boolean;
  /** Per-run opacity in 0..1. Omitted means fully opaque. */
  alpha?: number;
}

/**
 * Cached character widths and font metrics keyed by font specification.
 * Avoids calling `p.textStyle()` + `p.textWidth(ch)` per character on every frame.
 */
const glyphWidthCache = new Map<string, number>();
const ascentCache = new Map<string, number>();

function fontSpec(size: number, bold: boolean): string {
  const weight = bold ? '700' : '400';
  return `${weight} ${size}px "${theme.font.family}"`;
}

export function cachedGlyphWidth(
  ctx: CanvasRenderingContext2D,
  size: number,
  bold: boolean,
  ch: string,
): number {
  const spec = fontSpec(size, bold);
  const key = `${spec}|${ch}`;
  const hit = glyphWidthCache.get(key);
  if (hit !== undefined) return hit;
  const prev = ctx.font;
  ctx.font = spec;
  const w = ctx.measureText(ch).width;
  ctx.font = prev;
  glyphWidthCache.set(key, w);
  return w;
}

function cachedAscent(p: p5, size: number): number {
  const key = `${size.toFixed(2)}`;
  const hit = ascentCache.get(key);
  if (hit !== undefined) return hit;
  p.textSize(size);
  const ascent = p.textAscent();
  ascentCache.set(key, ascent);
  return ascent;
}

/** Sum of glyph advances for `text` at the current p5 textSize and given bold state. */
export function measureGlyphSpan(p: p5, text: string, bold = false): number {
  const ctx = ctx2d(p);
  const size = p.textSize();
  let width = 0;
  for (const ch of text) width += cachedGlyphWidth(ctx, size, bold, ch);
  return width;
}

/**
 * Text along a circle, starting at `angle` and running clockwise, glyphs outside radius `r`.
 * On the lower half the text is mirrored so it stays upright (Figma city labels).
 * `orientAt` locks that choice, so a second line stacked on the first does not flip on its own.
 * Uses the current fill and text size.
 */
export function arcText(
  p: p5,
  runs: TextRun[] | string,
  o: { cx: number; cy: number; r: number; angle: number; orientAt?: number },
): void {
  const list = typeof runs === 'string' ? [{ text: runs }] : runs;
  const ctx = ctx2d(p);
  const size = p.textSize();
  const glyphs: { ch: string; w: number; bold: boolean; alpha: number }[] = [];
  for (const run of list) {
    const bold = !!run.bold;
    const alpha = run.alpha ?? 1;
    for (const ch of run.text) {
      glyphs.push({ ch, w: cachedGlyphWidth(ctx, size, bold, ch), bold, alpha });
    }
  }
  const span = glyphs.reduce((sum, g) => sum + g.w, 0) / o.r;
  const flip = Math.sin(o.orientAt ?? o.angle + span / 2) > 0;
  const ascent = cachedAscent(p, size);
  const baseAlpha = ctx.globalAlpha;
  const normalFont = fontSpec(size, false);
  const boldFont = fontSpec(size, true);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let currentBold: boolean | null = null;
  let advanced = 0;
  for (const g of glyphs) {
    const t = (advanced + g.w / 2) / o.r;
    advanced += g.w;
    if (g.alpha <= 0) continue;
    const a = flip ? o.angle + span - t : o.angle + t;
    ctx.save();
    ctx.translate(o.cx + Math.cos(a) * o.r, o.cy + Math.sin(a) * o.r);
    ctx.rotate(flip ? a - Math.PI / 2 : a + Math.PI / 2);
    if (currentBold !== g.bold) {
      ctx.font = g.bold ? boldFont : normalFont;
      currentBold = g.bold;
    }
    ctx.globalAlpha = baseAlpha * g.alpha;
    ctx.fillText(g.ch, 0, flip ? ascent : 0);
    ctx.restore();
  }
  ctx.globalAlpha = baseAlpha;
  ctx.restore();
}
