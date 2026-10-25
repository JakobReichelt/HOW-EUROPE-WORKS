/**
 * Data -> visual channel rules (thresholds, scales, labels).
 * Pure constants and functions; used by the build script and the app.
 * Colours live in theme.ts.
 */
import type { Level3, SectorKey } from '../data/types';

export const SECTORS: Record<SectorKey, { label: string; nace: string }> = {
  public: { label: 'public services', nace: 'O-Q' },
  trade: { label: 'trade and hospitality', nace: 'G-I' },
  business: { label: 'business services', nace: 'M, N' },
  industry: { label: 'industry', nace: 'B-E' },
};

/** Unemployment rate (%) at which a city becomes "medium" / "high". */
export const UNEMPLOYMENT_THRESHOLDS = { medium: 7, high: 12 } as const;

/** Thickness of the grey shadow band in steps. */
export const UNEMPLOYMENT_STEPS: Record<Level3, number> = { low: 1, medium: 2, high: 3 };

export function unemploymentLevel(rate: number | null): Level3 | null {
  if (rate === null) return null;
  if (rate >= UNEMPLOYMENT_THRESHOLDS.high) return 'high';
  if (rate >= UNEMPLOYMENT_THRESHOLDS.medium) return 'medium';
  return 'low';
}

export type GuideStyle = 'solid' | 'dashed' | 'dotted';

/**
 * Commute time moves a segment outward from the baseline (linear, shared by all donuts).
 * The red guides are drawn at fixed minutes and only show how far segments have moved.
 */
export const COMMUTE = {
  domain: [20, 55] as const,
  guides: [
    { minutes: 30, style: 'solid' as GuideStyle },
    { minutes: 40, style: 'dashed' as GuideStyle },
    { minutes: 50, style: 'dotted' as GuideStyle },
  ],
} as const;

/** Sorted value at `p` in 0-1. `sorted` must be ascending and non-empty. */
function quantile(sorted: readonly number[], p: number): number {
  const i = Math.round((sorted.length - 1) * p);
  return sorted[Math.min(sorted.length - 1, Math.max(0, i))] ?? sorted[0]!;
}

/**
 * Commute minutes the legend marks. Quartiles of the cities that have a value,
 * rounded to a minute, so the ticks follow the dataset rather than 30 / 40 / 50.
 */
export function legendCommuteMinutes(values: readonly (number | null)[]): number[] {
  const sorted = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return COMMUTE.guides.map((g) => g.minutes);
  const picked = [0.25, 0.5, 0.75].map((p) => Math.round(quantile(sorted, p)));
  return [...new Set(picked)].sort((a, b) => a - b);
}

/**
 * A typical unemployment percent for each band, the median of cities in that band.
 * Falls back to the threshold that ends the band when a band is empty.
 */
export function legendUnemploymentPercents(
  rows: readonly { rate: number | null; level: Level3 | null }[],
): Record<Level3, number> {
  const fallback: Record<Level3, number> = {
    low: UNEMPLOYMENT_THRESHOLDS.medium,
    medium: UNEMPLOYMENT_THRESHOLDS.high,
    high: UNEMPLOYMENT_THRESHOLDS.high,
  };
  const out = { ...fallback };
  for (const level of ['low', 'medium', 'high'] as const) {
    const rates = rows
      .filter((row) => row.level === level && row.rate !== null)
      .map((row) => row.rate as number)
      .sort((a, b) => a - b);
    if (rates.length > 0) out[level] = Math.round(quantile(rates, 0.5));
  }
  return out;
}

/** Commute minutes normalised to 0-1 within COMMUTE.domain. Missing values sit on the baseline (0). */
export function commuteT(minutes: number | null): number {
  if (minutes === null) return 0;
  const [min, max] = COMMUTE.domain;
  return Math.min(1, Math.max(0, (minutes - min) / (max - min)));
}
