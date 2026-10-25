import { describe, expect, it } from 'vitest';
import { polar } from '../src/canvas/geometry';
import { donutHitRadius, hitDonut } from '../src/canvas/hit/hitTest';
import { donutLayout } from '../src/canvas/layout/donutLayout';
import { swissCities } from './fixtures';

const g = donutLayout([{ countryId: 'CH', cities: swissCities }], { cx: 200, cy: 200, R: 100 });

describe('hitDonut', () => {
  it('finds the city under the middle of each segment', () => {
    for (const s of g.segments) {
      const p = polar(g.cx, g.cy, (s.r0 + s.r1) / 2, (s.a0 + s.a1) / 2);
      expect(hitDonut(g, p.x, p.y)).toEqual({ countryId: 'CH', cityId: s.cityId });
    }
  });

  it('selects the country inside the drawn donut and misses the packing margin', () => {
    expect(hitDonut(g, g.cx, g.cy)).toEqual({ countryId: 'CH', cityId: null });
    expect(donutHitRadius(g)).toBeLessThan(g.outer);

    const margin = polar(g.cx, g.cy, (donutHitRadius(g) + g.outer) / 2, 0);
    expect(hitDonut(g, margin.x, margin.y)).toBeNull();
    expect(hitDonut(g, g.cx + g.outer + 1, g.cy)).toBeNull();
  });

  it('gives the gap between two cities to the nearer segment', () => {
    const [first, second] = g.segments;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    const gap = second.a0 - first.a1;
    expect(gap).toBeGreaterThan(0);

    const towardSecond = polar(g.cx, g.cy, (first.r0 + first.r1) / 2, first.a1 + gap / 4);
    expect(hitDonut(g, towardSecond.x, towardSecond.y)).toEqual({
      countryId: 'CH',
      cityId: first.cityId,
    });

    const towardFirst = polar(g.cx, g.cy, (second.r0 + second.r1) / 2, second.a0 - gap / 4);
    expect(hitDonut(g, towardFirst.x, towardFirst.y)).toEqual({
      countryId: 'CH',
      cityId: second.cityId,
    });
  });

  it('counts the unemployment band as part of the segment', () => {
    const geneva = g.segments.find((s) => s.cityId === 'geneva');
    expect(geneva).toBeDefined();
    if (!geneva || geneva.shadow <= 0) return;
    const band = polar(g.cx, g.cy, geneva.r1 + geneva.shadow * 0.5, (geneva.a0 + geneva.a1) / 2);
    expect(hitDonut(g, band.x, band.y)).toEqual({ countryId: 'CH', cityId: 'geneva' });
  });
});
