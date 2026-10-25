/**
 * Pure geometry for one donut (one country, or several countries combined).
 * No p5 here: the result is plain numbers that draw/ and hit/ consume, and tests can check.
 *
 * Radial structure of a city segment, from the centre outwards:
 *   r0 = baseline + commute offset   (commute minutes move the whole segment outward)
 *   r1 = r0 + band                   (the coloured segment)
 *   r1 + shadow                      (grey unemployment band, 1-3 steps)
 * Red guide rings sit at the r0 a segment would have at 30 / 40 / 50 min. They never move.
 */
import { COMMUTE, UNEMPLOYMENT_STEPS, commuteT, type GuideStyle } from '../../config/encoding';
import { theme } from '../../config/theme';
import type { City, SectorKey } from '../../data/types';
import { polar, TAU, type Point } from '../geometry';

/** Segments start at 12 o'clock and run clockwise. */
export const START_ANGLE = -Math.PI / 2;

const d = theme.donut;

export interface DonutGroup {
  countryId: string;
  cities: City[];
  /** Bracket text. Omitted on a single-country donut, where no bracket is drawn. */
  label?: string;
  /** Outer name ring. Off for a single city; on for a selected country. */
  bracket?: boolean;
}

export interface Segment {
  cityId: string;
  countryId: string;
  city: City;
  a0: number;
  a1: number;
  r0: number;
  r1: number;
  /** Thickness of the unemployment band outside r1 (0 if unknown). */
  shadow: number;
  /** End angle of the hatched commuter part (starts at a0), null if unknown. */
  hatchA1: number | null;
  /** Angle of the gender tick, null if unknown. */
  genderA: number | null;
  sector: SectorKey | null;
  missingCommute: boolean;
}

export interface Guide {
  minutes: number;
  style: GuideStyle;
  r: number;
}

export interface GroupArc {
  countryId: string;
  /** Bracket text. Falls back to the country name when omitted. */
  label?: string;
  /** Outer name ring. Off for a single city. */
  bracket?: boolean;
  a0: number;
  a1: number;
}

export interface DonutGeometry {
  countryIds: string[];
  cx: number;
  cy: number;
  R: number;
  guides: Guide[];
  segments: Segment[];
  groups: GroupArc[];
  /**
   * Three dots in the opening of a single-city ring, on the middle radius of the band.
   * Empty for every other donut.
   */
  ellipsis: Point[];
  /** Radius that contains everything of this donut. Used for hit testing and collisions. */
  outer: number;
}

/** Inner edge radius of a segment with the given commute time. */
export function commuteRadius(R: number, minutes: number | null): number {
  return R * (d.baseline + d.commuteSpan * commuteT(minutes));
}

export function outerExtent(R: number): number {
  return R * (d.baseline + d.commuteSpan + d.band + d.shadowStep * UNEMPLOYMENT_STEPS.high);
}

/**
 * Outermost radius that is actually drawn: the coloured ring plus its unemployment
 * band, or the 50 min guide when that sits further out. Used to pack donuts so the
 * visible graphs meet.
 */
export function drawnExtent(R: number, cities: City[]): number {
  const guide = Math.max(...COMMUTE.guides.map((g) => commuteRadius(R, g.minutes)));
  const painted = cities.map((city) => {
    const shadow = city.unemploymentLevel
      ? R * d.shadowStep * UNEMPLOYMENT_STEPS[city.unemploymentLevel]
      : 0;
    return commuteRadius(R, city.commuteMinutes) + R * d.band + shadow;
  });
  return Math.max(guide, ...painted);
}

/**
 * Radius for a selection donut. Every selection uses the same size. It shrinks only when
 * the segments, or the country brackets around them, would otherwise leave the viewport.
 */
export function selectionRadius(minSide: number, hasBrackets: boolean): number {
  const preferred = minSide * theme.focus.radius;
  const factor = hasBrackets ? d.groupRing : outerExtent(1);
  const pad = theme.detail.labelOffset + theme.font.xs;
  const room = Math.max(pad + 1, minSide / 2 - pad);
  return Math.min(preferred, room / factor);
}

/**
 * An arc label of angular width `span` fits a segment when it stays inside [a0, a1]
 * and does not cross the horizontal. Curved text flips on the lower half; a line that
 * crosses that boundary would turn upside down, so it does not count as fitting.
 */
export function labelFitsSegment(a0: number, a1: number, span: number): boolean {
  if (span > a1 - a0 + 1e-6) return false;
  if (span <= 0) return true;
  const end = (a0 + span) / Math.PI;
  return Math.floor(a0 / Math.PI) + 1 >= end - 1e-9;
}

/** World / screen point at the middle of a city segment (for panning and labels). */
export function citySegmentCenter(g: DonutGeometry, cityId: string): Point | null {
  const seg = g.segments.find((s) => s.cityId === cityId);
  if (!seg) return null;
  const angle = (seg.a0 + seg.a1) / 2;
  const r = (seg.r0 + seg.r1 + seg.shadow) / 2;
  return polar(g.cx, g.cy, r, angle);
}

export function donutLayout(
  groups: DonutGroup[],
  center: { cx: number; cy: number; R: number },
): DonutGeometry {
  const { cx, cy, R } = center;
  const entries = groups.flatMap((group) =>
    group.cities.map((city) => ({ countryId: group.countryId, city })),
  );
  const weights = entries.map((e) => Math.max(0, e.city.workingPeople ?? 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const n = entries.length;
  const singleCity = n === 1 && groups[0]?.bracket === false;
  const gap = singleCity ? d.singleGap : n > 1 ? d.gap : 0;
  const available = TAU - gap * n;

  let cursor = START_ANGLE;
  const segments: Segment[] = entries.map((entry, i) => {
    const share = total > 0 ? (weights[i] ?? 0) / total : 1 / n;
    const a0 = singleCity ? START_ANGLE : cursor + gap / 2;
    const a1 = singleCity ? START_ANGLE + TAU - gap : a0 + available * share;
    cursor = a1 + gap / 2;

    const { city } = entry;
    const r0 = commuteRadius(R, city.commuteMinutes);
    const span = a1 - a0;
    return {
      cityId: city.id,
      countryId: entry.countryId,
      city,
      a0,
      a1,
      r0,
      r1: r0 + R * d.band,
      shadow: city.unemploymentLevel
        ? R * d.shadowStep * UNEMPLOYMENT_STEPS[city.unemploymentLevel]
        : 0,
      hatchA1: city.commuterRate === null ? null : a0 + span * city.commuterRate,
      genderA: city.maleShare === null ? null : a0 + span * city.maleShare,
      sector: city.biggestSector,
      missingCommute: city.commuteMinutes === null,
    };
  });

  const groupArcs: GroupArc[] = [];
  let offset = 0;
  for (const group of groups) {
    const own = segments.slice(offset, offset + group.cities.length);
    offset += group.cities.length;
    const first = own[0];
    const last = own[own.length - 1];
    if (first && last) {
      groupArcs.push({
        countryId: group.countryId,
        label: group.label,
        bracket: group.bracket,
        a0: first.a0,
        a1: last.a1,
      });
    }
  }

  return {
    countryIds: groups.map((g) => g.countryId),
    cx,
    cy,
    R,
    guides: COMMUTE.guides.map((g) => ({ ...g, r: commuteRadius(R, g.minutes) })),
    segments,
    groups: groupArcs,
    ellipsis: singleCity ? cityEllipsis(cx, cy, segments[0], d.singleGap) : [],
    outer: outerExtent(R),
  };
}

/** Three dots across the opening, on the middle radius of the coloured band. */
function cityEllipsis(cx: number, cy: number, segment: Segment | undefined, gap: number): Point[] {
  if (!segment) return [];
  const radius = (segment.r0 + segment.r1) / 2;
  return [0.25, 0.5, 0.75].map((t) => polar(cx, cy, radius, segment.a1 + gap * t));
}
