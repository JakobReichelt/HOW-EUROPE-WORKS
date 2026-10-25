import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDataset, parseNumber, type DataConfig } from '../scripts/lib/buildDataset';

const root = resolve(__dirname, '..');
const csv = readFileSync(resolve(root, 'data/raw/eurostat_european_cities.csv'), 'utf8');
const config = JSON.parse(
  readFileSync(resolve(root, 'data/config/cities.json'), 'utf8'),
) as DataConfig;
const { dataset, warnings } = buildDataset(csv, config, '2026-01-01');

describe('parseNumber', () => {
  it('handles empty and invalid values', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber(' 12.5 ')).toBe(12.5);
  });
});

describe('buildDataset', () => {
  it('maps every CSV city and every configured country', () => {
    expect(warnings.every((w) => w.includes('NACE breakdown'))).toBe(true);
    expect(dataset.cities).toHaveLength(48);
    expect(dataset.countries).toHaveLength(17);
  });

  it('repairs Lisboa and Porto when the published jobs total breaks', () => {
    const lisboa = dataset.cities.find((c) => c.id === 'lisboa');
    const porto = dataset.cities.find((c) => c.id === 'porto');
    expect(lisboa?.commuterRate).toBeCloseTo(0.539, 2);
    expect(porto?.commuterRate).toBeCloseTo(0.522, 2);
    expect(warnings.map((w) => w.split(':')[0])).toEqual(['Lisboa', 'Porto']);
  });

  it('derives the Zurich reference values', () => {
    const zurich = dataset.cities.find((c) => c.id === 'zurich');
    expect(zurich).toBeDefined();
    expect(Math.round(zurich!.workingPeople!)).toBe(408783);
    expect(zurich!.commuterRate).toBeCloseTo(0.32, 2);
    expect(zurich!.maleShare).toBeCloseTo(0.53, 2);
    expect(zurich!.unemploymentLevel).toBe('low');
    expect(zurich!.commuteMinutes).toBeCloseTo(39.9, 1);
    expect(zurich!.biggestSector).toBe('public');
    expect(zurich!.missing).toEqual([]);
  });

  it('orders Swiss cities by working people', () => {
    const ch = dataset.countries.find((c) => c.id === 'CH');
    expect(ch?.cityIds).toEqual(['zurich', 'geneva', 'basel']);
  });

  it('classifies Geneva unemployment as high', () => {
    expect(dataset.cities.find((c) => c.id === 'geneva')?.unemploymentLevel).toBe('high');
  });

  it('throws on unmapped cities', () => {
    const renamed = csv.replace('Zurich (greater city)', 'Atlantis');
    expect(() => buildDataset(renamed, config)).toThrow(/Atlantis/);
  });
});
