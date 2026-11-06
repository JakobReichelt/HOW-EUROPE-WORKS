import { describe, expect, it } from 'vitest';
import { START_ANGLE, donutLayout } from '../src/canvas/layout/donutLayout';
import { interpolateDonut, mapDonut } from '../src/canvas/layout/donutTween';
import { makeCity, swissCities } from './fixtures';

const R = 100;
const center = { cx: 0, cy: 0, R };

describe('interpolateDonut', () => {
  const swiss = donutLayout([{ countryId: 'CH', cities: swissCities }], center);
  const zurichOnly = donutLayout(
    [{ countryId: 'CH', cities: [swissCities[0]!], bracket: false }],
    center,
  );

  it('returns the endpoints', () => {
    const at0 = interpolateDonut(swiss, zurichOnly, 0);
    const at1 = interpolateDonut(swiss, zurichOnly, 1);
    expect(at0.segments.map((s) => s.cityId)).toEqual(swiss.segments.map((s) => s.cityId));
    expect(at1.segments.map((s) => s.cityId)).toEqual(zurichOnly.segments.map((s) => s.cityId));
    expect(at0.cx).toBe(swiss.cx);
    expect(at1.R).toBe(zurichOnly.R);
  });

  it('keeps the first surviving segment a0 fixed when appending', () => {
    const fr = donutLayout(
      [{ countryId: 'FR', cities: [makeCity({ id: 'paris', country: 'FR', workingPeople: 500 })] }],
      center,
    );
    const combined = donutLayout(
      [
        {
          countryId: 'FR',
          label: 'France',
          cities: [makeCity({ id: 'paris', country: 'FR', workingPeople: 500 })],
        },
        {
          countryId: 'DE',
          label: 'Berlin',
          bracket: false,
          cities: [makeCity({ id: 'berlin', country: 'DE', workingPeople: 200 })],
        },
      ],
      { cx: 50, cy: 50, R: 120 },
    );
    const mid = interpolateDonut(fr, combined, 0.5);
    const paris = mid.segments.find((s) => s.cityId === 'paris')!;
    expect(paris.a0).toBeCloseTo(fr.segments[0]!.a0, 5);
  });

  it('starts an entering segment at zero width', () => {
    const fr = donutLayout(
      [{ countryId: 'FR', cities: [makeCity({ id: 'paris', country: 'FR', workingPeople: 500 })] }],
      center,
    );
    const combined = donutLayout(
      [
        {
          countryId: 'FR',
          cities: [makeCity({ id: 'paris', country: 'FR', workingPeople: 500 })],
        },
        {
          countryId: 'DE',
          bracket: false,
          cities: [makeCity({ id: 'berlin', country: 'DE', workingPeople: 200 })],
        },
      ],
      center,
    );
    const early = interpolateDonut(fr, combined, 0.001);
    const berlin = early.segments.find((s) => s.cityId === 'berlin')!;
    expect(berlin.a1 - berlin.a0).toBeLessThan(0.01);
  });

  it('collapses an exiting segment to zero width at the end', () => {
    const late = interpolateDonut(swiss, zurichOnly, 0.999);
    const geneva = late.segments.find((s) => s.cityId === 'geneva');
    expect(geneva).toBeDefined();
    expect(geneva!.a1 - geneva!.a0).toBeLessThan(0.01);
  });

  it('keeps hatch and gender angles inside the segment', () => {
    const mid = interpolateDonut(swiss, zurichOnly, 0.4);
    for (const seg of mid.segments) {
      if (seg.hatchA1 !== null) {
        expect(seg.hatchA1).toBeGreaterThanOrEqual(seg.a0 - 1e-9);
        expect(seg.hatchA1).toBeLessThanOrEqual(seg.a1 + 1e-9);
      }
      if (seg.genderA !== null) {
        expect(seg.genderA).toBeGreaterThanOrEqual(seg.a0 - 1e-9);
        expect(seg.genderA).toBeLessThanOrEqual(seg.a1 + 1e-9);
      }
    }
  });

  it('mapDonut scales radii and moves the centre', () => {
    const mapped = mapDonut(swiss, 200, 300, 50);
    expect(mapped.cx).toBe(200);
    expect(mapped.cy).toBe(300);
    expect(mapped.R).toBe(50);
    expect(mapped.segments[0]!.r0).toBeCloseTo(swiss.segments[0]!.r0 * 0.5);
    expect(mapped.segments[0]!.a0).toBeCloseTo(swiss.segments[0]!.a0);
    expect(mapped.segments[0]!.a0).toBeGreaterThan(START_ANGLE - 1);
  });
});
