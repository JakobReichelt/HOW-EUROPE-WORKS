/**
 * Legend callout placement (quadrant ruleset).
 *
 * Angles in this file are the project's math angles (0 = east, CCW). The ruleset
 * is written in clock angles (0 = 12 o'clock, CW); convert with `clockAngle`.
 *
 * Direction (per side of the segment)
 * -----------------------------------
 * Unemployment anchors at a0; commute at a1 (data encoding). Preferred travel:
 *   +1 = CW on screen (increasing math angle)
 *   -1 = CCW on screen (decreasing math angle)
 *
 * Staircase
 * ---------
 * Default: outermost ring longest, innermost shortest (pixel arc length).
 * Top-left exception: when the callout sits on the LEFT of the segment in the
 * top or left quarter, reverse that -- longest inside, shortest outside -- so
 * long strokes do not sweep through outer labels.
 *
 * Text at each line tip (horizontal, never upside-down)
 * ----------------------------------------------------
 * Anchor is past the tip along the callout tangent by pad + fontH/2 (middle
 * baseline must not reach back onto the stroke). Peaks use center align with
 * an extra half text-width. Elsewhere: left open space -> right-align, right
 * open space -> left-align.
 *
 * Collision
 * ---------
 * Lengthen arcs until label AABBs clear, keeping the staircase order.
 */
import { theme } from '../../config/theme';
import { normalizeAngle, polar, type Point, type Rect } from '../geometry';

const L = theme.legend;
const TAU = Math.PI * 2;
/** Clock radians from top treated as the north/south "peak" band. */
const PEAK = 0.18;

export type CircleQuarter = 'top' | 'right' | 'bottom' | 'left';
export type SegmentSide = 'left' | 'right';
export type TextAlign = 'left' | 'right' | 'center';

export interface LegendMarkSpec {
  r: number;
  text: string;
  textWidth: number;
}

export interface LegendSnippetPlace {
  r: number;
  text: string;
  a0: number;
  a1: number;
  at: Point;
  align: TextAlign;
  pixelLength: number;
  quarter: CircleQuarter;
  side: SegmentSide;
}

export interface CalloutContext {
  quarter: CircleQuarter;
  side: SegmentSide;
  align: TextAlign;
  away: Point;
  /** Longest inside / shortest outside (top-left, left-of-segment). */
  reverseStaircase: boolean;
}

/**
 * Clock angle: 0 at 12 o'clock, increasing clockwise, in [0, TAU).
 * Math angle 0 is east; math -PI/2 is 12 o'clock.
 */
export function clockAngle(mathAngle: number): number {
  return normalizeAngle(mathAngle + Math.PI / 2, 0);
}

/** Right hemisphere -> +1 (CW); left hemisphere -> -1 (CCW). */
export function hemisphereDir(midMath: number): 1 | -1 {
  return clockAngle(midMath) < Math.PI ? 1 : -1;
}

export function quarterOf(mathAngle: number): CircleQuarter {
  const c = clockAngle(mathAngle);
  if (c < PEAK || c > TAU - PEAK) return 'top';
  if (c >= Math.PI - PEAK && c <= Math.PI + PEAK) return 'bottom';
  if (c < Math.PI) return 'right';
  return 'left';
}

/**
 * Top or left quarter with the fan on the left of the segment -> reverse
 * staircase (shortest outside, longest inside).
 */
export function reverseStaircase(near: number, direction: 1 | -1): boolean {
  const q = quarterOf(near);
  if (q !== 'top' && q !== 'left') return false;
  const away = tipAway(near, direction);
  // Leftward open space, or vertical at 9 o'clock while shooting CCW.
  return away.x < 0 || (direction < 0 && Math.abs(away.x) < 1e-9);
}

/** Preferred callout context at an anchor before the tip is known. */
export function calloutContext(near: number, direction: 1 | -1): CalloutContext {
  const tip = near + direction * 0.01;
  const place = textAtTip(tip, polar(0, 0, 1, tip), 0, theme.font.xs, 0, direction);
  const away = tipAway(near, direction);
  return {
    quarter: quarterOf(tip),
    side: away.x < 0 ? 'left' : 'right',
    align: place.align,
    away,
    reverseStaircase: reverseStaircase(near, direction),
  };
}

/**
 * Place one side of the legend.
 * `direction` +1 = clockwise, -1 = counterclockwise (screen / math-angle sense).
 */
export function placeLegendSnippets(
  center: Point,
  near: number,
  direction: 1 | -1,
  marks: readonly LegendMarkSpec[],
  sizeScale: number,
): LegendSnippetPlace[] {
  if (marks.length === 0) return [];

  const byRadius = [...marks].sort((a, b) => a.r - b.r);
  const n = byRadius.length;
  const reversed = reverseStaircase(near, direction);
  const snippet = L.snippet * sizeScale;
  const lengthStep = L.lengthStep * sizeScale;
  const fontH = theme.font.xs * sizeScale;
  const pad = L.labelPad * sizeScale;
  const gap = L.labelGap * sizeScale;
  const growPx = Math.max(2, L.growStep * sizeScale);
  const minTipPx = fontH + gap;

  // i = 0 innermost. Default: outer long. Top-left left-of-segment: inner long.
  const spans = byRadius.map((mark, i) => {
    const r = Math.max(mark.r, 1);
    const step = reversed ? n - 1 - i : i;
    let pixels = snippet + step * lengthStep;
    const extend = Math.min(pixels / r, L.maxArc);
    pixels = extend * r;
    return { mark, r, pixels, extend };
  });
  enforceStaircase(spans, reversed, lengthStep, minTipPx);

  // Place in tip order (near -> far) so collision grows the fan outward.
  const order = spans
    .map((span, index) => ({ span, index }))
    .sort((a, b) => a.span.extend - b.span.extend);

  const placed: (LegendSnippetPlace | null)[] = Array.from({ length: n }, () => null);
  const boxes: Rect[] = [];

  for (const { span, index } of order) {
    let candidate = placeOne(center, near, direction, span, pad, fontH);

    while (boxes.some((box) => overlaps(box, candidate.box, gap)) && span.extend < L.resolveArc) {
      span.pixels = Math.min(span.pixels + growPx, L.resolveArc * span.r);
      span.extend = span.pixels / span.r;
      enforceStaircase(spans, reversed, lengthStep, minTipPx);
      candidate = placeOne(center, near, direction, span, pad, fontH);
    }

    placed[index] = candidate.place;
    boxes.push(candidate.box);
  }

  return placed.filter((p): p is LegendSnippetPlace => p !== null);
}

/** Keep pixel staircase + minimum tip separation. */
function enforceStaircase(
  spans: { r: number; pixels: number; extend: number }[],
  reversed: boolean,
  lengthStep: number,
  minTipPx: number,
): void {
  if (reversed) {
    // Inner (low i) must stay longer than outer (high i).
    for (let i = spans.length - 2; i >= 0; i--) {
      const outer = spans[i + 1]!;
      const inner = spans[i]!;
      if (inner.pixels <= outer.pixels) {
        inner.pixels = Math.min(outer.pixels + lengthStep, L.resolveArc * inner.r);
        inner.extend = inner.pixels / inner.r;
      }
    }
    // Tip travel: outer tips closer to the segment than inner tips.
    let prevExtend = 0;
    const byExtend = [...spans].sort((a, b) => a.extend - b.extend);
    for (const cur of byExtend) {
      const floor = prevExtend + minTipPx / cur.r;
      if (cur.extend < floor) {
        cur.extend = Math.min(floor, L.resolveArc);
        cur.pixels = cur.extend * cur.r;
      }
      prevExtend = cur.extend;
    }
    // Re-assert inner-long after tip floors (outer may have been pushed).
    for (let i = spans.length - 2; i >= 0; i--) {
      const outer = spans[i + 1]!;
      const inner = spans[i]!;
      if (inner.pixels <= outer.pixels) {
        inner.pixels = Math.min(outer.pixels + lengthStep, L.resolveArc * inner.r);
        inner.extend = inner.pixels / inner.r;
      }
    }
    return;
  }

  // Default: outer long.
  let prevExtend = 0;
  for (let i = 0; i < spans.length; i++) {
    const cur = spans[i]!;
    if (i > 0) {
      const floor = prevExtend + minTipPx / cur.r;
      if (cur.extend < floor) {
        cur.extend = Math.min(floor, L.resolveArc);
        cur.pixels = cur.extend * cur.r;
      }
      if (cur.pixels <= spans[i - 1]!.pixels) {
        cur.pixels = Math.min(spans[i - 1]!.pixels + lengthStep, L.resolveArc * cur.r);
        cur.extend = cur.pixels / cur.r;
      }
    }
    prevExtend = cur.extend;
  }
}

function placeOne(
  center: Point,
  near: number,
  direction: 1 | -1,
  span: { mark: LegendMarkSpec; r: number; pixels: number; extend: number },
  pad: number,
  fontH: number,
): { place: LegendSnippetPlace; box: Rect } {
  const arcEnd = near + direction * span.extend;
  const tip = polar(center.x, center.y, span.r, arcEnd);
  const text = textAtTip(arcEnd, tip, pad, fontH, span.mark.textWidth, direction);
  const away = tipAway(near, direction);
  return {
    place: {
      r: span.mark.r,
      text: span.mark.text,
      a0: Math.min(near, arcEnd),
      a1: Math.max(near, arcEnd),
      at: text.at,
      align: text.align,
      pixelLength: span.pixels,
      quarter: quarterOf(arcEnd),
      side: away.x < 0 ? 'left' : 'right',
    },
    box: labelBox(text.at, text.align, span.mark.textWidth, fontH),
  };
}

/**
 * Horizontal text fully past the arc tip along the callout tangent.
 *
 * Canvas uses a middle baseline, so half the glyph height reaches back toward
 * the tip when the tangent is steep. Clearance is therefore
 * `pad + fontH/2`, and at peaks an extra half text-width so a centered label
 * cannot straddle the stroke (that looked like a strikethrough).
 */
export function textAtTip(
  tipMath: number,
  tip: Point,
  pad: number,
  fontH: number,
  textWidth: number,
  direction: 1 | -1,
): { at: Point; align: TextAlign } {
  const away = tipAway(tipMath, direction);
  const c = clockAngle(tipMath);
  const atPeak = c < PEAK || c > TAU - PEAK || Math.abs(c - Math.PI) <= PEAK;
  const align: TextAlign = atPeak ? 'center' : away.x < 0 ? 'right' : 'left';
  // Near edge of the label sits `pad` past the tip; middle baseline + optional
  // half-width for centered peak labels push the anchor further out.
  let along = pad + fontH / 2;
  if (align === 'center') along += textWidth / 2;
  const at = { x: tip.x + away.x * along, y: tip.y + away.y * along };
  return { at, align };
}

/** Unit tangent into open space next to the segment along `direction`. */
export function tipAway(angle: number, direction: 1 | -1): Point {
  return direction > 0
    ? { x: -Math.sin(angle), y: Math.cos(angle) }
    : { x: Math.sin(angle), y: -Math.cos(angle) };
}

function labelBox(at: Point, align: TextAlign, textWidth: number, fontH: number): Rect {
  const x = align === 'left' ? at.x : align === 'right' ? at.x - textWidth : at.x - textWidth / 2;
  return { x, y: at.y - fontH / 2, w: textWidth, h: fontH };
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}
