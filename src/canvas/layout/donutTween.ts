/**
 * Pure interpolation between two DonutGeometry layouts.
 * Surviving cities (same cityId) lerp angles and radii. Entering cities grow from a
 * zero-width slit at 12 o'clock (or after their preceding survivor); exiting cities
 * collapse the other way. The first surviving segment keeps its a0, so the 12 o'clock
 * edge does not slide.
 */
import { theme } from '../../config/theme';
import { TAU, type Point } from '../geometry';
import {
  START_ANGLE,
  type DonutGeometry,
  type GroupArc,
  type Guide,
  type Segment,
} from './donutLayout';
import { lerp } from '../anim/tween';

const gap = theme.donut.gap;

/** Remap a donut to a new centre and radius, keeping angles. */
export function mapDonut(g: DonutGeometry, cx: number, cy: number, R: number): DonutGeometry {
  if (g.R === 0) {
    return { ...g, cx, cy, R, segments: [], guides: [], groups: [], ellipsis: [], outer: 0 };
  }
  const s = R / g.R;
  const ox = g.cx;
  const oy = g.cy;
  const mapPoint = (p: Point): Point => ({
    x: cx + (p.x - ox) * s,
    y: cy + (p.y - oy) * s,
  });
  return {
    countryIds: g.countryIds,
    cx,
    cy,
    R,
    guides: g.guides.map((guide) => ({ ...guide, r: guide.r * s })),
    segments: g.segments.map((seg) => ({
      ...seg,
      r0: seg.r0 * s,
      r1: seg.r1 * s,
      shadow: seg.shadow * s,
    })),
    groups: g.groups.map((group) => ({ ...group })),
    ellipsis: g.ellipsis.map(mapPoint),
    outer: g.outer * s,
  };
}

/**
 * Interpolate `from` toward `to` at `t` in [0, 1].
 * t = 0 returns a geometry matching `from` (plus zero-width stubs for entering cities).
 * t = 1 returns `to`.
 */
export function interpolateDonut(from: DonutGeometry, to: DonutGeometry, t: number): DonutGeometry {
  if (t <= 0) return cloneDonut(from);
  if (t >= 1) return cloneDonut(to);

  const fromById = indexSegments(from.segments);
  const toById = indexSegments(to.segments);
  const fromOrder = from.segments.map((s) => s.cityId);
  const toOrder = to.segments.map((s) => s.cityId);

  const segments: Segment[] = [];
  // First survivor in the old ring keeps its a0 so the 12 o'clock edge does not slide.
  const pinnedA0 = fromOrder.find((id) => toById.has(id)) ?? null;

  for (const id of toOrder) {
    const dest = toById.get(id)!;
    const src = fromById.get(id);
    if (src) {
      segments.push(lerpSegment(src, dest, t, id === pinnedA0));
    } else {
      const origin = enterAngle(id, from, to, fromOrder, toOrder, fromById);
      segments.push(growSegment(dest, origin, t, from, to));
    }
  }

  for (const id of fromOrder) {
    if (toById.has(id)) continue;
    const src = fromById.get(id)!;
    const origin = exitAngle(id, from, to, fromOrder, toOrder, toById);
    segments.push(shrinkSegment(src, origin, t, from, to));
  }

  segments.sort((a, b) => midAngle(a) - midAngle(b));

  return {
    countryIds: t < 0.5 ? from.countryIds : to.countryIds,
    cx: lerp(from.cx, to.cx, t),
    cy: lerp(from.cy, to.cy, t),
    R: lerp(from.R, to.R, t),
    guides: lerpGuides(from.guides, to.guides, t),
    segments,
    groups: lerpGroups(from.groups, to.groups, t),
    ellipsis: lerpEllipsis(from, to, t),
    outer: lerp(from.outer, to.outer, t),
  };
}

function cloneDonut(g: DonutGeometry): DonutGeometry {
  return {
    countryIds: [...g.countryIds],
    cx: g.cx,
    cy: g.cy,
    R: g.R,
    guides: g.guides.map((guide) => ({ ...guide })),
    segments: g.segments.map((seg) => ({ ...seg })),
    groups: g.groups.map((group) => ({ ...group })),
    ellipsis: g.ellipsis.map((p) => ({ ...p })),
    outer: g.outer,
  };
}

function indexSegments(segments: Segment[]): Map<string, Segment> {
  return new Map(segments.map((s) => [s.cityId, s]));
}

function midAngle(seg: Segment): number {
  return (seg.a0 + seg.a1) / 2;
}

/** Angle just after the preceding survivor in `from`, or the 12 o'clock slit for an append. */
function enterAngle(
  cityId: string,
  from: DonutGeometry,
  _to: DonutGeometry,
  fromOrder: string[],
  toOrder: string[],
  fromById: Map<string, Segment>,
): number {
  const idx = toOrder.indexOf(cityId);
  for (let i = idx - 1; i >= 0; i--) {
    const prevId = toOrder[i]!;
    if (!fromById.has(prevId)) continue;
    const prev = fromById.get(prevId)!;
    return prev.a1 + gap / 2;
  }
  // Appended at the end, or the first new city with no survivor before it: grow from 12 o'clock.
  if (from.segments.length === 0) return START_ANGLE;
  const lastFrom = from.segments[from.segments.length - 1]!;
  // Prefer the open slit before 12 o'clock when the new city sits after every survivor.
  const survivorsBefore = toOrder.slice(0, idx).filter((id) => fromById.has(id));
  if (survivorsBefore.length === fromOrder.length) {
    return START_ANGLE + TAU - gap / 2;
  }
  return lastFrom.a1 + gap / 2;
}

/** Angle in `to` where an exiting city collapses (after its preceding survivor). */
function exitAngle(
  cityId: string,
  _from: DonutGeometry,
  to: DonutGeometry,
  fromOrder: string[],
  _toOrder: string[],
  toById: Map<string, Segment>,
): number {
  const idx = fromOrder.indexOf(cityId);
  for (let i = idx - 1; i >= 0; i--) {
    const prevId = fromOrder[i]!;
    if (!toById.has(prevId)) continue;
    const prev = toById.get(prevId)!;
    return prev.a1 + gap / 2;
  }
  for (let i = idx + 1; i < fromOrder.length; i++) {
    const nextId = fromOrder[i]!;
    if (!toById.has(nextId)) continue;
    const next = toById.get(nextId)!;
    return next.a0 - gap / 2;
  }
  if (to.segments.length === 0) return START_ANGLE;
  return START_ANGLE + TAU - gap / 2;
}

function lerpSegment(src: Segment, dest: Segment, t: number, pinA0: boolean): Segment {
  const a0 = pinA0 ? src.a0 : lerp(src.a0, dest.a0, t);
  const a1 = lerp(src.a1, dest.a1, t);
  return withChannels({
    ...dest,
    a0,
    a1,
    r0: lerp(src.r0, dest.r0, t),
    r1: lerp(src.r1, dest.r1, t),
    shadow: lerp(src.shadow, dest.shadow, t),
  });
}

/** Entering city: zero-width at `origin`, then a0 slides counter-clockwise toward dest.a0. */
function growSegment(
  dest: Segment,
  origin: number,
  t: number,
  from: DonutGeometry,
  to: DonutGeometry,
): Segment {
  const scale = from.R === 0 ? 1 : lerp(from.R, to.R, t) / to.R;
  const a1 = lerp(origin, dest.a1, t);
  const a0 = lerp(origin, dest.a0, t);
  return withChannels({
    ...dest,
    a0,
    a1,
    r0: dest.r0 * scale,
    r1: dest.r1 * scale,
    shadow: dest.shadow * scale,
  });
}

/** Exiting city: full at t = 0, collapsed to `origin` at t = 1. */
function shrinkSegment(
  src: Segment,
  origin: number,
  t: number,
  from: DonutGeometry,
  to: DonutGeometry,
): Segment {
  const scale = to.R === 0 ? 1 : lerp(from.R, to.R, t) / from.R;
  const a0 = lerp(src.a0, origin, t);
  const a1 = lerp(src.a1, origin, t);
  return withChannels({
    ...src,
    a0,
    a1,
    r0: src.r0 * scale,
    r1: src.r1 * scale,
    shadow: src.shadow * scale,
  });
}

function withChannels(seg: Segment): Segment {
  const span = seg.a1 - seg.a0;
  return {
    ...seg,
    hatchA1: seg.city.commuterRate === null ? null : seg.a0 + span * seg.city.commuterRate,
    genderA: seg.city.maleShare === null ? null : seg.a0 + span * seg.city.maleShare,
  };
}

function lerpGuides(from: Guide[], to: Guide[], t: number): Guide[] {
  const n = Math.max(from.length, to.length);
  const out: Guide[] = [];
  for (let i = 0; i < n; i++) {
    const a = from[i] ?? to[i]!;
    const b = to[i] ?? from[i]!;
    out.push({
      minutes: b.minutes,
      style: b.style,
      r: lerp(a.r, b.r, t),
    });
  }
  return out;
}

function lerpGroups(from: GroupArc[], to: GroupArc[], t: number): GroupArc[] {
  const fromById = new Map(from.map((g) => [g.countryId, g]));
  const toById = new Map(to.map((g) => [g.countryId, g]));
  const ids = [...new Set([...from.map((g) => g.countryId), ...to.map((g) => g.countryId)])];
  const out: GroupArc[] = [];
  for (const id of ids) {
    const a = fromById.get(id);
    const b = toById.get(id);
    if (a && b) {
      out.push({
        countryId: id,
        label: t < 0.5 ? a.label : b.label,
        bracket: t < 0.5 ? a.bracket : b.bracket,
        a0: lerp(a.a0, b.a0, t),
        a1: lerp(a.a1, b.a1, t),
      });
    } else if (b) {
      const origin = a ? a.a0 : b.a0;
      out.push({
        ...b,
        a0: lerp(origin, b.a0, t),
        a1: lerp(origin, b.a1, t),
      });
    } else if (a) {
      const origin = (a.a0 + a.a1) / 2;
      out.push({
        ...a,
        a0: lerp(a.a0, origin, t),
        a1: lerp(a.a1, origin, t),
      });
    }
  }
  return out;
}

function lerpEllipsis(from: DonutGeometry, to: DonutGeometry, t: number): Point[] {
  if (to.ellipsis.length > 0 && from.ellipsis.length === 0) {
    return t >= 0.85 ? to.ellipsis.map((p) => ({ ...p })) : [];
  }
  if (from.ellipsis.length > 0 && to.ellipsis.length === 0) {
    return t <= 0.15 ? from.ellipsis.map((p) => ({ ...p })) : [];
  }
  if (to.ellipsis.length === 0) return [];
  const n = Math.min(from.ellipsis.length, to.ellipsis.length);
  if (n === 0) return to.ellipsis.map((p) => ({ ...p }));
  return to.ellipsis.map((p, i) => {
    const q = from.ellipsis[i] ?? p;
    return { x: lerp(q.x, p.x, t), y: lerp(q.y, p.y, t) };
  });
}
