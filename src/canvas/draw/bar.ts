/** Intro bar (Figma 415:1295 ... 419:2744). Drawn in design pixels; the scene scales the frame. */
import type p5 from 'p5';
import { theme } from '../../config/theme';
import type { BarCallout, BarGeometry, BarScaleArrow } from '../layout/barLayout';
import type { Rect } from '../geometry';
import { ctx2d, drawMarsSymbol, hatchLines, setDash, withRectClip } from './shapes';

const c = theme.color;
const t = theme.intro;

export function drawBar(p: p5, g: BarGeometry): void {
  const { box } = g;
  p.push();

  for (const line of g.callouts) {
    if (!line.overBox) drawCallout(p, box, line);
  }

  if (g.shadow > 0) {
    const ctx = ctx2d(p);
    ctx.save();
    ctx.globalAlpha = 0.5;
    p.noStroke();
    p.fill(c.shadow);
    p.rect(box.x, box.y - g.shadow, box.w, g.shadow);
    ctx.restore();
  }

  p.fill(c.paper);
  p.stroke(c.ink);
  p.strokeWeight(theme.stroke.thin);
  p.rect(box.x, box.y, box.w, box.h);

  if (g.hatchW !== null && g.hatchW > 2) {
    const area = { x: box.x + 1, y: box.y + 1, w: g.hatchW - 2, h: box.h - 2 };
    withRectClip(p, area, () => {
      p.stroke(c.ink);
      p.strokeWeight(theme.stroke.thin);
      hatchLines(
        p,
        area.x + area.w / 2,
        area.y + area.h / 2,
        Math.hypot(area.w, area.h) / 2,
        theme.detail.hatchSpacing,
        theme.detail.hatchAngle,
      );
    });
    p.stroke(c.ink);
    p.strokeWeight(theme.stroke.thin);
    p.line(box.x + g.hatchW, box.y, box.x + g.hatchW, box.y + box.h);
  }

  for (const line of g.callouts) {
    if (line.overBox) drawCallout(p, box, line);
  }

  for (const arrow of g.scaleArrows) drawScaleArrow(p, arrow);

  if (g.genderX !== null) {
    const bottom = box.y + box.h;
    const { symbolSize, symbolLeft, symbolTop, tick, labelTop } = t.gender;
    const r = symbolSize * 0.42;
    const symbolX = g.genderX - symbolLeft + r;
    const symbolY = bottom + symbolTop + r * 1.45;
    p.stroke(c.ink);
    p.strokeWeight(theme.stroke.thin);
    setDash(p, 'dashed');
    p.line(g.genderX, box.y, g.genderX, bottom);
    setDash(p, 'none');
    p.line(g.genderX, bottom, g.genderX, bottom + tick);
    drawMarsSymbol(p, symbolX, symbolY, symbolSize);
    if (g.genderLabel) {
      drawMixed(
        p,
        g.genderLabel.strong,
        g.genderLabel.rest,
        g.genderX - symbolLeft,
        bottom + labelTop,
        'left',
      );
    }
  }

  if (g.bracket) drawBracket(p, g.bracket);
  p.pop();
}

function drawCallout(p: p5, box: Rect, line: BarCallout): void {
  const x0 = line.outsideBox ? Math.max(line.x0, box.x + box.w) : line.x0;
  if (x0 >= line.x1) return;
  const stroke =
    line.tone === 'commute' ? c.commute : line.soft && line.labelMuted ? c.muted : c.ink;
  p.stroke(stroke);
  p.strokeWeight(theme.stroke.thin);
  setDash(p, line.style);
  p.line(x0, line.y, line.x1, line.y);
  setDash(p, 'none');
  if (!line.label) return;
  const ctx = ctx2d(p);
  ctx.save();
  ctx.font = face(400);
  ctx.fillStyle = line.labelMuted ? c.mutedDark : c.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(line.label, line.x1 + t.calloutGap, line.y);
  ctx.restore();
}

/** Short red stem with an upward arrowhead between two neighbouring scale marks. */
function drawScaleArrow(p: p5, arrow: BarScaleArrow): void {
  const { head, gap } = t.scaleArrow;
  const y0 = arrow.y0 + gap;
  const y1 = arrow.y1 - gap;
  if (y1 - y0 < head * 2) return;
  const x = arrow.x;
  p.stroke(c.commute);
  p.strokeWeight(theme.stroke.thin);
  p.strokeCap(p.SQUARE);
  p.line(x, y0, x, y1);
  p.line(x, y0, x - head, y0 + head);
  p.line(x, y0, x + head, y0 + head);
}

function drawBracket(p: p5, bracket: BarGeometry['bracket']): void {
  if (!bracket) return;
  const { x0, x1, y, strong, rest } = bracket;
  const mid = (x0 + x1) / 2;
  const half = t.bracket.tick / 2;
  p.stroke(c.ink);
  p.strokeWeight(theme.stroke.thin);
  p.line(x0, y, x1, y);
  p.line(x0, y - half, x0, y + half);
  p.line(x1, y - half, x1, y + half);
  p.line(mid, y, mid, y + t.bracket.tick);
  drawMixed(p, strong, rest, mid, y + t.bracket.labelGap, 'center');
}

/** Medium number plus a regular suffix, centred or left-aligned on `x`. */
function drawMixed(
  p: p5,
  strong: string,
  rest: string,
  x: number,
  y: number,
  align: 'center' | 'left',
): void {
  const ctx = ctx2d(p);
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.fillStyle = c.ink;
  const strongW = measure(ctx, 500, strong);
  const restW = rest ? measure(ctx, 400, rest) : 0;
  let cursor = align === 'center' ? x - (strongW + restW) / 2 : x;
  ctx.font = face(500);
  ctx.textAlign = 'left';
  ctx.fillText(strong, cursor, y);
  cursor += strongW;
  if (rest) {
    ctx.font = face(400);
    ctx.fillText(rest, cursor, y);
  }
  ctx.restore();
}

function face(weight: number): string {
  return `${weight} ${theme.font.xs}px "${theme.font.family}"`;
}

function measure(ctx: CanvasRenderingContext2D, weight: number, text: string): number {
  ctx.font = face(weight);
  return ctx.measureText(text).width;
}
