import { describe, expect, it } from 'vitest';
import { legendCommuteMinutes, legendUnemploymentPercents } from '../src/config/encoding';

describe('legend scale from the dataset', () => {
  it('uses commute quartiles, rounded, and drops duplicates', () => {
    expect(legendCommuteMinutes([19.2, 26.9, 30.36, 36, 44.74, null])).toEqual([27, 30, 36]);
  });

  it('falls back to the fixed guides when no city has a commute time', () => {
    expect(legendCommuteMinutes([null, null])).toEqual([30, 40, 50]);
  });

  it('uses the median unemployment percent of each band', () => {
    expect(
      legendUnemploymentPercents([
        { rate: 4, level: 'low' },
        { rate: 6, level: 'low' },
        { rate: 8, level: 'medium' },
        { rate: 10, level: 'medium' },
        { rate: 12, level: 'high' },
        { rate: 14, level: 'high' },
        { rate: null, level: null },
      ]),
    ).toEqual({ low: 6, medium: 10, high: 14 });
  });
});
