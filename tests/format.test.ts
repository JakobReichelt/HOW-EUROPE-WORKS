import { describe, expect, it } from 'vitest';
import { formatInt, formatMinutes, formatPercent } from '../src/data/format';

describe('format', () => {
  it('uses apostrophes as thousands separator', () => {
    expect(formatInt(408782.59)).toBe("408'783");
    expect(formatInt(1234567)).toBe("1'234'567");
    expect(formatInt(999)).toBe('999');
  });

  it('formats shares and minutes', () => {
    expect(formatPercent(0.3198)).toBe('32%');
    expect(formatMinutes(39.9)).toBe('40 min');
    expect(formatPercent(null)).toBe('no data');
  });
});
