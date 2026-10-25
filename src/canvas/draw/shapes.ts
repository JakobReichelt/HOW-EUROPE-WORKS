/** Low-level p5 drawing helpers. Callers set fill/stroke; these only build shapes. */
import type p5 from 'p5';
import type { GuideStyle } from '../../config/encoding';
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
  step: number,
): void {
  const steps = Math.max(2, Math.ceil((a1 - a0) / step));
  p.beginShape();
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    p.vertex(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / steps;
    p.vertex(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
  }
  p.endShape(p.CLOSE);
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
  p.strokeWeight(Math.max(1, lineScale));
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
  p.strokeWeight(Math.max(1, lineScale));
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

/** Run `body` with drawing clipped to an annular sector. */
export function withSectorClip(
  p: p5,
  sector: { cx: number; cy: number; r0: number; r1: number; a0: number; a1: number },
  body: () => void,
): void {
  const ctx = ctx2d(p);
  ctx.save();
  ctx.beginPath();
  ctx.arc(sector.cx, sector.cy, sector.r1, sector.a0, sector.a1);
  ctx.arc(sector.cx, sector.cy, sector.r0, sector.a1, sector.a0, true);
  ctx.closePath();
  ctx.clip();
  body();
  ctx.restore();
}

export function withRectClip(p: p5, rect: Rect, body: () => void): void {
  const ctx = ctx2d(p);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  body();
  ctx.restore();
}

/** Parallel lines at `angle` covering a circle of `extent` around (cx, cy). Use inside a clip. */
export function hatchLines(
  p: p5,
  cx: number,
  cy: number,
  extent: number,
  spacing: number,
  angle: number,
): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let t = -extent; t <= extent; t += spacing) {
    const ox = cx - dy * t;
    const oy = cy + dx * t;
    p.line(ox - dx * extent, oy - dy * extent, ox + dx * extent, oy + dy * extent);
  }
}

export interface TextRun {
  text: string;
  bold?: boolean;
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
  const glyphs: { ch: string; w: number; bold: boolean }[] = [];
  for (const run of list) {
    p.textStyle(run.bold ? p.BOLD : p.NORMAL);
    for (const ch of run.text) glyphs.push({ ch, w: p.textWidth(ch), bold: !!run.bold });
  }
  const span = glyphs.reduce((sum, g) => sum + g.w, 0) / o.r;
  const flip = Math.sin(o.orientAt ?? o.angle + span / 2) > 0;
  const ascent = p.textAscent();

  p.push();
  p.textAlign(p.CENTER, p.BASELINE);
  let advanced = 0;
  for (const g of glyphs) {
    const t = (advanced + g.w / 2) / o.r;
    advanced += g.w;
    const a = flip ? o.angle + span - t : o.angle + t;
    p.push();
    p.translate(o.cx + Math.cos(a) * o.r, o.cy + Math.sin(a) * o.r);
    p.rotate(flip ? a - Math.PI / 2 : a + Math.PI / 2);
    p.textStyle(g.bold ? p.BOLD : p.NORMAL);
    p.text(g.ch, 0, flip ? ascent : 0);
    p.pop();
  }
  p.pop();
  p.textStyle(p.NORMAL);
}
