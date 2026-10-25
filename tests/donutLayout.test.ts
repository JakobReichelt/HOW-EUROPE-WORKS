import { describe, expect, it } from 'vitest';
import { COMMUTE } from '../src/config/encoding';
import { theme } from '../src/config/theme';
import { TAU } from '../src/canvas/geometry';
import {
  START_ANGLE,
  commuteRadius,
  donutLayout,
  labelFitsSegment,
  selectionRadius,
} from '../src/canvas/layout/donutLayout';
import { makeCity, swissCities } from './fixtures';

const R = 100;
const swiss = donutLayout([{ countryId: 'CH', cities: swissCities }], { cx: 0, cy: 0, R });

describe('donutLayout', () => {
  it('moves segments outward with longer commutes', () => {
    const [zurich, geneva, basel] = swiss.segments;
    expect(zurich!.r0).toBeGreaterThan(geneva!.r0);
    expect(geneva!.r0).toBeGreaterThan(basel!.r0);
  });

  it('keeps guide rings fixed at 30 / 40 / 50 min regardless of data', () => {
    const other = donutLayout(
      [{ countryId: 'X', cities: [makeCity({ id: 'a', commuteMinutes: 55 })] }],
      {
        cx: 0,
        cy: 0,
        R,
      },
    );
    expect(swiss.guides.map((g) => g.minutes)).toEqual(COMMUTE.guides.map((g) => g.minutes));
    expect(other.guides).toEqual(swiss.guides);
    expect(swiss.guides[0]!.r).toBeCloseTo(commuteRadius(R, 30));
  });

  it('sizes arcs by working people and covers the circle minus gaps', () => {
    const spans = swiss.segments.map((s) => s.a1 - s.a0);
    expect(spans[0]).toBeGreaterThan(spans[1]!);
    expect(spans[1]).toBeGreaterThan(spans[2]!);
    expect(swiss.segments[0]!.a0).toBeGreaterThan(START_ANGLE);
    expect(swiss.segments[2]!.a1).toBeLessThan(START_ANGLE + TAU);
  });

  it('scales the unemployment band with the level', () => {
    const [zurich, geneva] = swiss.segments;
    expect(geneva!.shadow).toBeCloseTo(zurich!.shadow * 3);
  });

  it('draws a single-city country as a full ring without gaps', () => {
    const lu = donutLayout(
      [{ countryId: 'LU', cities: [makeCity({ id: 'lu', workingPeople: null })] }],
      {
        cx: 0,
        cy: 0,
        R,
      },
    );
    expect(lu.segments[0]!.a1 - lu.segments[0]!.a0).toBeCloseTo(TAU);
    expect(lu.ellipsis).toEqual([]);
  });

  it('leaves an opening and an ellipsis on the ring when one city is selected', () => {
    const g = donutLayout(
      [
        {
          countryId: 'FR',
          bracket: false,
          cities: [makeCity({ id: 'paris', commuteMinutes: 30 })],
        },
      ],
      { cx: 10, cy: 20, R },
    );
    const seg = g.segments[0]!;
    expect(seg.a0).toBeCloseTo(START_ANGLE);
    expect(seg.a1).toBeCloseTo(START_ANGLE + TAU - theme.donut.singleGap);
    expect(g.ellipsis).toHaveLength(3);
    const radius = (seg.r0 + seg.r1) / 2;
    for (const dot of g.ellipsis) {
      expect(Math.hypot(dot.x - 10, dot.y - 20)).toBeCloseTo(radius);
    }
    const mid = g.ellipsis[1]!;
    expect(mid.x).toBeLessThan(10);
    expect(mid.y).toBeCloseTo(20 - radius * Math.cos(theme.donut.singleGap / 2));
  });

  it('puts missing commute on the baseline', () => {
    const g = donutLayout(
      [{ countryId: 'X', cities: [makeCity({ id: 'a', commuteMinutes: null })] }],
      {
        cx: 0,
        cy: 0,
        R,
      },
    );
    expect(g.segments[0]!.missingCommute).toBe(true);
    expect(g.segments[0]!.r0).toBeCloseTo(commuteRadius(R, COMMUTE.domain[0]));
  });

  it('creates one group arc per country when combined', () => {
    const g = donutLayout(
      [
        { countryId: 'CH', cities: swissCities },
        { countryId: 'X', cities: [makeCity({ id: 'x1' })] },
      ],
      { cx: 0, cy: 0, R },
    );
    expect(g.groups.map((gr) => gr.countryId)).toEqual(['CH', 'X']);
    expect(g.groups[0]!.a1).toBeLessThan(g.groups[1]!.a0);
  });

  it('keeps a bracket per city when two cities share a country', () => {
    const g = donutLayout(
      [
        {
          countryId: 'DE',
          label: 'Berlin',
          cities: [makeCity({ id: 'berlin', workingPeople: 100 })],
        },
        {
          countryId: 'DE',
          label: 'Hamburg',
          cities: [makeCity({ id: 'hamburg', workingPeople: 50 })],
        },
      ],
      { cx: 0, cy: 0, R },
    );
    expect(g.groups.map((group) => group.label)).toEqual(['Berlin', 'Hamburg']);
    expect(g.groups[0]!.a1).toBeLessThan(g.groups[1]!.a0);
    expect(g.segments.map((segment) => segment.cityId)).toEqual(['berlin', 'hamburg']);
  });
});

describe('selectionRadius', () => {
  it('uses one size for a country and for several cities', () => {
    expect(selectionRadius(900, false)).toBeCloseTo(900 * theme.focus.radius);
    expect(selectionRadius(900, true)).toBeCloseTo(900 * theme.focus.radius);
  });

  it('shrinks only when the brackets would leave a short viewport', () => {
    const open = selectionRadius(480, false);
    const bracketed = selectionRadius(480, true);
    expect(open).toBeCloseTo(480 * theme.focus.radius);
    expect(bracketed).toBeLessThan(open);
  });
});

describe('labelFitsSegment', () => {
  const top = -Math.PI / 2;

  it('accepts a label that stays on its segment and on one half of the ring', () => {
    expect(labelFitsSegment(top, top + 1, 0.4)).toBe(true);
  });

  it('rejects a label that runs into the next segment', () => {
    expect(labelFitsSegment(top, top + 0.3, 0.5)).toBe(false);
  });

  it('rejects a label that would cross onto the lower half and flip', () => {
    expect(labelFitsSegment(-0.2, 1.2, 0.5)).toBe(false);
  });

  it('accepts a label that stays on the lower half', () => {
    expect(labelFitsSegment(0.4, 1.2, 0.5)).toBe(true);
  });

  it('accepts a label that ends on the upright boundary', () => {
    expect(labelFitsSegment(top, 0.2, -top)).toBe(true);
  });
});
