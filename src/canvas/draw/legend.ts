/**
 * Interactive legend (Figma 360:6643): one city segment stays visible above a white veil.
 * Commute guides sit just past the segment. Unemployment steps sit on the other side.
 * Each scale also has a fine line for where the segment sits when that metric is missing.
 * Geometry is already in screen space. `sizeScale` is screenR / focusR so callouts
 * shrink with the canvas zoom like city names and gender labels on the same donut.
 */
import type p5 from 'p5';
import { UNEMPLOYMENT_STEPS, type GuideStyle } from '../../config/encoding';
import type { Level3 } from '../../data/types';
import { formatRate } from '../../data/format';
import { theme } from '../../config/theme';
import { LEGEND } from '../../content/about';
import type { SectorFilter } from '../../state/types';
import {
  START_ANGLE,
  commuteRadius,
  type DonutGeometry,
  type Segment,
} from '../layout/donutLayout';
import { placeLegendSnippets } from '../layout/legendLayout';
import { TAU } from '../geometry';
import { drawSegment, segmentHover } from './donut';
import { setDash } from './shapes';

const c = theme.color;
const L = theme.legend;
const LEVELS = ['low', 'medium', 'high'] as const;

/** Typical unemployment percent of each band, from the dataset. */
export interface LegendScale {
  unemploymentPercent: Record<Level3, number>;
}

export function drawVeil(p: p5, rect: { x: number; y: number; w: number; h: number }): void {
  p.push();
  p.noStroke();
  p.fill(255, 255, 255, 255 * L.veilAlpha);
  p.rect(rect.x, rect.y, rect.w, rect.h);
  p.pop();
}

/**
 * Segment the legend explains when nothing is hovered.
 * A complete city near 12 o'clock, skipping one that fills the whole ring.
 */
export function defaultLegendSegment(g: DonutGeometry): Segment | null {
  if (g.segments.length === 0) return null;
  const modest = g.segments.filter((seg) => seg.a1 - seg.a0 <= L.maxExampleSpan);
  const pool = modest.length > 0 ? modest : g.segments;
  const fewest = Math.min(...pool.map((seg) => seg.city.missing.length));
  const candidates = pool.filter((seg) => seg.city.missing.length === fewest);
  return candidates.reduce((best, seg) =>
    angleDistance(midAngle(seg), START_ANGLE) < angleDistance(midAngle(best), START_ANGLE)
      ? seg
      : best,
  );
}

export function drawLegend(
  p: p5,
  g: DonutGeometry,
  seg: Segment,
  sectorFilter: SectorFilter,
  scale: LegendScale,
  sizeScale: number,
): void {
  p.push();
  p.textFont(theme.font.family);
  p.textSize(theme.font.xs * sizeScale);
  const hover = segmentHover(p, seg, sizeScale);
  drawSegment(p, g, seg, {
    lineScale: 1,
    textScale: sizeScale,
    // Legend geometry is screen-space already (resetMatrix); do not re-apply camera zoom.
    zoom: 1,
    detail: 'full',
    hoverCityId: null,
    hoverCountry: false,
    sectorFilter,
    details: true,
    omitCityName: hover.place === 'arc',
  });
  hover.paint(g);
  drawUnemployment(p, g, seg, scale, sizeScale);
  drawCommuteGuides(p, g, seg, sizeScale);
  p.pop();
}

/**
 * Unemployment steps as short arcs on the side opposite the commute guides.
 * A fine line at the segment's outer edge is where the band sits when unemployment is missing.
 */
function drawUnemployment(
  p: p5,
  g: DonutGeometry,
  seg: Segment,
  scale: LegendScale,
  sizeScale: number,
): void {
  const step = g.R * theme.donut.shadowStep;
  const level = seg.city.unemploymentLevel;
  const marks: ScaleMark[] = [
    { r: seg.r1, text: LEGEND.noData, active: level === null, kind: 'missing' },
    ...LEVELS.map((name) => ({
      r: seg.r1 + step * UNEMPLOYMENT_STEPS[name],
      text: formatRate(scale.unemploymentPercent[name]),
      active: name === level,
      kind: 'level' as const,
    })),
  ];
  drawSnippets(p, g, seg.a0 - theme.donut.gap, -1, marks, sizeScale);
}

/** Short arcs on the same radii as the red guide rings of the donut. */
function drawCommuteGuides(p: p5, g: DonutGeometry, seg: Segment, sizeScale: number): void {
  const minutes = seg.city.commuteMinutes;
  const nearest =
    minutes === null
      ? null
      : g.guides.reduce((a, b) =>
          Math.abs(b.minutes - minutes) < Math.abs(a.minutes - minutes) ? b : a,
        ).minutes;
  const marks: ScaleMark[] = [
    {
      r: commuteRadius(g.R, null),
      text: LEGEND.noData,
      active: minutes === null,
      kind: 'missing',
    },
    ...g.guides.map((guide) => ({
      r: guide.r,
      text: guide.minutes === nearest ? LEGEND.commute(guide.minutes) : `${guide.minutes} min`,
      active: guide.minutes === nearest,
      kind: 'commute' as const,
      dash: guide.style,
    })),
  ];
  drawSnippets(p, g, seg.a1 + theme.donut.gap, 1, marks, sizeScale);
}

interface ScaleMark {
  r: number;
  text: string;
  active: boolean;
  kind: 'commute' | 'level' | 'missing';
  dash?: GuideStyle;
}

/**
 * One side of the segment. Placement (quadrant text anchors, outer-long
 * staircase, AABB grow) lives in legendLayout. `direction` +1 = CW, -1 = CCW.
 */
function drawSnippets(
  p: p5,
  g: DonutGeometry,
  near: number,
  direction: 1 | -1,
  marks: ScaleMark[],
  sizeScale: number,
): void {
  const byText = new Map(marks.map((mark) => [mark.text + '@' + mark.r, mark]));
  const placed = placeLegendSnippets(
    { x: g.cx, y: g.cy },
    near,
    direction,
    marks.map((mark) => ({
      r: mark.r,
      text: mark.text,
      textWidth: measure(p, mark.text, sizeScale),
    })),
    sizeScale,
  );
  for (const item of placed) {
    const mark = byText.get(item.text + '@' + item.r);
    if (!mark) continue;
    p.noFill();
    if (mark.kind === 'commute') {
      p.stroke(c.commute);
      p.strokeWeight(theme.stroke.thin);
      setDash(p, mark.dash ?? 'solid');
    } else if (mark.kind === 'missing') {
      p.stroke(mark.active ? c.ink : c.muted);
      p.strokeWeight(theme.stroke.thin);
      setDash(p, 'none');
    } else {
      p.stroke(c.ink);
      p.strokeWeight(theme.stroke.thin);
      setDash(p, 'none');
    }
    p.arc(g.cx, g.cy, item.r * 2, item.r * 2, item.a0, item.a1);
    setDash(p, 'none');
    label(p, item.at, item.text, item.align, mark.active ? c.ink : L.inactive, sizeScale);
  }
}

function midAngle(seg: Segment): number {
  return (seg.a0 + seg.a1) / 2;
}

function angleDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % TAU;
  return Math.min(d, TAU - d);
}

/** Screen pixels after resetMatrix; size follows the annotated donut (selection = 1). */
function measure(p: p5, text: string, sizeScale: number): number {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const prev = ctx.font;
  ctx.font = `${theme.font.xs * sizeScale}px "${theme.font.family}"`;
  const width = ctx.measureText(text).width;
  ctx.font = prev;
  return width;
}

function label(
  p: p5,
  at: { x: number; y: number },
  text: string,
  align: 'left' | 'right' | 'center',
  color: string,
  sizeScale: number,
): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const density = p.pixelDensity();
  ctx.save();
  ctx.setTransform(density, 0, 0, density, 0, 0);
  ctx.font = `${theme.font.xs * sizeScale}px "${theme.font.family}"`;
  ctx.fillStyle = color;
  ctx.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
  ctx.textBaseline = 'middle';
  // `at` already includes the tip nudge from legendLayout.
  ctx.fillText(text, at.x, at.y);
  ctx.restore();
}
