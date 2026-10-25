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
 * Hemisphere of the segment midpoint sets the natural default:
 *   right half (clock 0..180) -> CW from a1
 *   left half  (clock 180..360) -> CCW from a0
 * Callers pass that preferred dir; a clearance flip can invert it.
 *
 * Staircase
 * ---------
 * Outermost ring longest, innermost shortest (pixel arc length).
 *
 * Text at each line tip (horizontal, never upside-down)
 * ----------------------------------------------------
 *   tip left of centre  -> align right,  nudge left
 *   tip right of centre -> align left,   nudge right
 *   tip near 12 o'clock -> align center, nudge up
 *   tip near 6 o'clock  -> align center, nudge down
 *
 * Collision
 * ---------
 * Lengthen arcs in steps until label AABBs no longer overlap (outer stays longest).
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

/** Preferred callout context at an anchor before the tip is known. */
export function calloutContext(near: number, direction: 1 | -1): CalloutContext {
  const tip = near + direction * 0.01;
  const place = textAtTip({ x: 0, y: 0 }, tip, polar(0, 0, 1, tip), 0, direction);
  const away = tipAway(near, direction);
  return {
    quarter: quarterOf(tip),
    side: away.x < 0 ? 'left' : 'right',
    align: place.align,
    away,
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
  const snippet = L.snippet * sizeScale;
  const lengthStep = L.lengthStep * sizeScale;
  const fontH = theme.font.xs * sizeScale;
  const pad = L.labelPad * sizeScale;
  const gap = L.labelGap * sizeScale;
  const growPx = Math.max(2, L.growStep * sizeScale);

  // Base staircase: outer longest in screen pixels along the arc. Also keep a
  // minimum tip-to-tip travel so tight rings (unemployment steps) cannot stack
  // labels on top of each other near 12 o'clock.
  const minTipPx = fontH + gap;
  const spans = byRadius.map((mark, i) => {
    const r = Math.max(mark.r, 1);
    let pixels = snippet + i * lengthStep;
    const extend = Math.min(pixels / r, L.maxArc);
    pixels = extend * r;
    return { mark, r, pixels, extend };
  });
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

  const placed: LegendSnippetPlace[] = [];
  const boxes: Rect[] = [];

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]!;
    let candidate = placeOne(center, near, direction, span, pad, fontH);

    while (boxes.some((box) => overlaps(box, candidate.box, gap)) && span.extend < L.resolveArc) {
      span.pixels = Math.min(span.pixels + growPx, L.resolveArc * span.r);
      span.extend = span.pixels / span.r;
      for (let j = i + 1; j < spans.length; j++) {
        const inner = spans[j - 1]!;
        const outer = spans[j]!;
        const floor = inner.extend + minTipPx / outer.r;
        if (outer.extend < floor) {
          outer.extend = Math.min(floor, L.resolveArc);
          outer.pixels = outer.extend * outer.r;
        }
        if (outer.pixels <= inner.pixels) {
          outer.pixels = Math.min(inner.pixels + lengthStep, L.resolveArc * outer.r);
          outer.extend = outer.pixels / outer.r;
        }
      }
      candidate = placeOne(center, near, direction, span, pad, fontH);
    }

    placed.push(candidate.place);
    boxes.push(candidate.box);
  }

  return placed;
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
  const text = textAtTip(center, arcEnd, tip, pad, direction);
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
    box: labelBox(text.at, text.align, span.mark.textWidth, fontH, 0),
  };
}

/**
 * Horizontal text at the line tip. Never rotates (no upside-down type).
 *
 * Top/bottom peaks use centered anchors above/below the tip. Everywhere else
 * text grows into the callout tangent (`tipAway`): open space on the left ->
 * right-align; open space on the right -> left-align. Using the tip's clock
 * hemisphere alone fails near 12 o'clock (Marseille), where tips are still in
 * the "right" half while the staircase is heading left into whitespace.
 */
export function textAtTip(
  _center: Point,
  tipMath: number,
  tip: Point,
  pad: number,
  direction: 1 | -1,
): { at: Point; align: TextAlign } {
  const c = clockAngle(tipMath);
  if (c < PEAK || c > TAU - PEAK) {
    return { at: { x: tip.x, y: tip.y - pad }, align: 'center' };
  }
  if (Math.abs(c - Math.PI) <= PEAK) {
    return { at: { x: tip.x, y: tip.y + pad }, align: 'center' };
  }
  const away = tipAway(tipMath, direction);
  if (away.x < 0) {
    return { at: { x: tip.x - pad, y: tip.y }, align: 'right' };
  }
  return { at: { x: tip.x + pad, y: tip.y }, align: 'left' };
}

/** Unit tangent into open space next to the segment along `direction`. */
export function tipAway(angle: number, direction: 1 | -1): Point {
  return direction > 0
    ? { x: -Math.sin(angle), y: Math.cos(angle) }
    : { x: Math.sin(angle), y: -Math.cos(angle) };
}

function labelBox(
  at: Point,
  align: TextAlign,
  textWidth: number,
  fontH: number,
  pad: number,
): Rect {
  const x =
    align === 'left'
      ? at.x + pad
      : align === 'right'
        ? at.x - pad - textWidth
        : at.x - textWidth / 2;
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
