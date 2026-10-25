import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { theme } from '../src/config/theme';
import { radiusScale, worldLayout } from '../src/canvas/layout/worldLayout';
import type { Dataset } from '../src/data/types';

const dataset = JSON.parse(
  readFileSync(resolve(__dirname, '../public/data/europe.json'), 'utf8'),
) as Dataset;

describe('worldLayout', () => {
  const nodes = worldLayout(dataset.countries, dataset.cities);

  it('keeps every pair at least the Figma padding apart', () => {
    expect(nodes).toHaveLength(dataset.countries.length);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.outer + b.outer - 0.5);
      }
    }
  });

  it('keeps map order and lets every donut touch another', () => {
    const at = (id: string) => nodes.find((n) => n.countryId === id)!;
    const gap = (a: (typeof nodes)[number], b: (typeof nodes)[number]) =>
      Math.hypot(a.x - b.x, a.y - b.y) - a.outer - b.outer;

    expect(at('IE').x).toBeLessThan(at('UK').x);
    expect(at('PT').x).toBeLessThan(at('ES').x);
    expect(at('ES').x).toBeLessThan(at('IT').x);
    expect(at('FR').x).toBeLessThan(at('DE').x);
    expect(at('DE').x).toBeLessThan(at('PL').x);
    expect(at('UK').y).toBeLessThan(at('FR').y);
    expect(at('DE').y).toBeLessThan(at('IT').y);
    expect(at('PL').y).toBeLessThan(at('HU').y);
    expect(at('FR').y).toBeLessThan(at('ES').y);

    expect(gap(at('IE'), at('UK'))).toBeLessThanOrEqual(theme.world.padding + 0.5);
    expect(gap(at('PT'), at('ES'))).toBeLessThanOrEqual(theme.world.padding + 0.5);
    expect(gap(at('ES'), at('FR'))).toBeLessThanOrEqual(theme.world.padding + 0.5);

    for (const node of nodes) {
      const nearest = Math.min(
        ...nodes.filter((other) => other !== node).map((other) => gap(node, other)),
      );
      expect(nearest).toBeGreaterThanOrEqual(theme.world.padding - 0.5);
      expect(nearest).toBeLessThanOrEqual(theme.world.padding + 0.5);
    }
  });

  it('packs donuts closely instead of spreading them out', () => {
    const gaps = nodes.map((a) =>
      Math.min(
        ...nodes
          .filter((b) => b !== a)
          .map((b) => Math.hypot(a.x - b.x, a.y - b.y) - a.outer - b.outer),
      ),
    );
    const median = [...gaps].sort((x, y) => x - y)[Math.floor(gaps.length / 2)]!;
    expect(median).toBeLessThan(theme.world.padding * 3);
  });

  it('is deterministic', () => {
    expect(worldLayout(dataset.countries, dataset.cities)).toEqual(nodes);
  });

  it('keeps the smallest country at minRadius and scales others by sqrt of headcount', () => {
    const radius = radiusScale(dataset.countries);
    const people = dataset.countries.map((c) => c.workingPeople);
    const lo = Math.min(...people);
    const hi = Math.max(...people);
    expect(radius(lo)).toBeCloseTo(theme.world.minRadius);
    expect(radius(hi)).toBeCloseTo(theme.world.minRadius * Math.sqrt(hi / lo));
    for (const country of dataset.countries) {
      const expected = theme.world.minRadius * Math.sqrt(country.workingPeople / lo);
      expect(radius(country.workingPeople)).toBeCloseTo(expected);
    }
  });
});
